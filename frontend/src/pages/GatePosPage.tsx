import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PrintableDocument } from '../components/TicketPrintModal';
import { ActiveTurnsTable } from '../components/gate/ActiveTurnsTable';
import type { TurnQuickFilter } from '../components/gate/ActiveTurnsTable';
import { CheckInPanel } from '../components/gate/CheckInPanel';
import { CheckoutModal } from '../components/gate/CheckoutModal';
import { GateStatsStrip } from '../components/gate/GateStatsStrip';
import { MoveSlotModal } from '../components/gate/MoveSlotModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../context/ToastContext';
import { apiRequest, getErrorMessage } from '../lib/api';
import { pickDefaultEmployeeId } from '../lib/employee';
import { getHoursParked } from '../lib/time';
import type {
  ActiveTurn,
  CardRecord,
  CatalogsResponse,
  FeeQuote,
  ParkingLot,
  ParkingSlot,
  PaymentMethod,
} from '../types';

export function normalizePlateKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function findMatchingLotForVehicleType(
  lots: ParkingLot[],
  vehicleTypeName: string | undefined,
): ParkingLot | null {
  const normalized = vehicleTypeName?.trim().toLowerCase();
  if (!normalized) return null;
  return lots.find((lot) => lot.tenbaido.toLowerCase().includes(normalized)) ?? null;
}

export function selectGateCheckInCards(
  allAvailableCards: CardRecord[],
  plateInput: string,
): { matchedPassCard: CardRecord | null; checkInCards: CardRecord[]; walkinCards: CardRecord[] } {
  const walkinCards = allAvailableCards.filter((c) => !c.pass_plate);
  const normalized = normalizePlateKey(plateInput);
  const matchedPassCard = normalized
    ? (allAvailableCards.find(
        (c) => c.pass_plate && normalizePlateKey(c.pass_plate) === normalized,
      ) ?? null)
    : null;
  const checkInCards = matchedPassCard ? [matchedPassCard, ...walkinCards] : walkinCards;
  return { matchedPassCard, checkInCards, walkinCards };
}

interface CheckInMutationVars {
  plate: string;
  vehicleTypeId: number;
  slotId: number;
  cardId: number;
  employeeId: number;
  employeeName?: string;
  vehicleTypeName?: string;
  slotLabel?: string;
  cardCode?: string;
}

interface CheckOutMutationVars {
  turn: ActiveTurn;
  paymentMethod: PaymentMethod;
  lostCard: boolean;
  lostCardFee: number;
  replacementCardId: number | null;
  employeeId: number;
  employeeName?: string;
}

interface GatePosPageProps {
  onPrint: (doc: PrintableDocument) => void;
}

function isMonthlyTurn(turn: ActiveTurn): boolean {
  return turn.is_monthly_pass !== undefined
    ? Boolean(turn.is_monthly_pass)
    : turn.loaive === 'tháng';
}

export function GatePosPage({ onPrint }: GatePosPageProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const plateInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [plate, setPlate] = useState('');
  const [vehicleTypeId, setVehicleTypeId] = useState<number | ''>('');
  const [selectedLotId, setSelectedLotId] = useState<number | ''>('');
  const [slotId, setSlotId] = useState<number | ''>('');
  const [cardId, setCardId] = useState<number | ''>('');
  const [checkInEmpOverride, setCheckInEmpOverride] = useState<number | ''>('');
  const [quickFilter, setQuickFilter] = useState<TurnQuickFilter>('all');

  // URL ?q= is single source of truth so deep-links from Alerts/CommandPalette/Overview work seamlessly
  const search = searchParams.get('q') ?? '';
  const queryParamQ = searchParams.get('q');

  useEffect(() => {
    if (queryParamQ) {
      searchInputRef.current?.focus();
    }
  }, [queryParamQ]);

  const handleSearchChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set('q', val);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  // Modal states
  const [checkoutTurn, setCheckoutTurn] = useState<ActiveTurn | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Tiền mặt');
  const [lostCard, setLostCard] = useState(false);
  const [lostCardFee, setLostCardFee] = useState(50000);
  const [replacementCardId, setReplacementCardId] = useState<number | ''>('');
  const [checkOutEmpOverride, setCheckOutEmpOverride] = useState<number | ''>('');

  const [moveTurn, setMoveTurn] = useState<ActiveTurn | null>(null);
  const [targetSlotId, setTargetSlotId] = useState<number | ''>('');
  const [cancelTurnTarget, setCancelTurnTarget] = useState<ActiveTurn | null>(null);

  const catalogsQuery = useQuery<CatalogsResponse>({
    queryKey: ['catalogs'],
    queryFn: ({ signal }) => apiRequest<CatalogsResponse>('/api/v1/catalogs', { signal }),
    staleTime: 60_000,
  });

  const turnsQuery = useQuery<ActiveTurn[]>({
    queryKey: ['turns', 'active'],
    queryFn: ({ signal }) => apiRequest<ActiveTurn[]>('/api/v1/turns/active', { signal }),
  });

  const slotsQuery = useQuery<ParkingSlot[]>({
    queryKey: ['slots', 'free'],
    queryFn: ({ signal }) => apiRequest<ParkingSlot[]>('/api/v1/slots?status_filter=1', { signal }),
  });

  const cardsQuery = useQuery<CardRecord[]>({
    queryKey: ['cards', 'gate-available'],
    queryFn: ({ signal }) =>
      apiRequest<CardRecord[]>('/api/v1/cards?only_available=true&exclude_pass_bound=false', {
        signal,
      }),
  });

  const quoteQuery = useQuery<FeeQuote>({
    queryKey: ['turns', 'quote', checkoutTurn?.id_luotdo],
    queryFn: ({ signal }) =>
      apiRequest<FeeQuote>(`/api/v1/turns/${checkoutTurn!.id_luotdo}/quote`, { signal }),
    enabled: Boolean(checkoutTurn),
    staleTime: 0,
  });

  const catalogs = catalogsQuery.data;
  const employees = useMemo(() => catalogs?.employees ?? [], [catalogs?.employees]);
  const availableSlots = useMemo(() => slotsQuery.data ?? [], [slotsQuery.data]);
  const allGateCards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);
  const activeTurns = useMemo(() => turnsQuery.data ?? [], [turnsQuery.data]);

  const { matchedPassCard, checkInCards, walkinCards } = useMemo(
    () => selectGateCheckInCards(allGateCards, plate),
    [allGateCards, plate],
  );

  const effectiveVehicleTypeId =
    vehicleTypeId || matchedPassCard?.pass_vehicle_type_id || catalogs?.vehicle_types[0]?.id || '';
  const effectiveVehicleType = useMemo(
    () => catalogs?.vehicle_types.find((vt) => vt.id === Number(effectiveVehicleTypeId)),
    [catalogs, effectiveVehicleTypeId],
  );
  const matchedLotForVehicle = useMemo(
    () => findMatchingLotForVehicleType(catalogs?.lots ?? [], effectiveVehicleType?.tenloai),
    [catalogs, effectiveVehicleType],
  );
  const effectiveLotId = selectedLotId || matchedLotForVehicle?.id || catalogs?.lots[0]?.id || '';

  const effectiveCheckInEmpId = useMemo<number | ''>(() => {
    if (checkInEmpOverride && employees.some((e) => e.id === checkInEmpOverride)) {
      return checkInEmpOverride;
    }
    return pickDefaultEmployeeId(employees, {
      lotId: effectiveLotId,
      preferredRole: 'guard',
    });
  }, [checkInEmpOverride, employees, effectiveLotId]);

  const effectiveCheckOutEmpId = useMemo<number | ''>(() => {
    if (checkOutEmpOverride && employees.some((e) => e.id === checkOutEmpOverride)) {
      return checkOutEmpOverride;
    }
    return pickDefaultEmployeeId(employees, {
      lotId: checkoutTurn?.idbdx,
      preferredRole: 'cashier',
    });
  }, [checkOutEmpOverride, employees, checkoutTurn?.idbdx]);

  const handleVehicleTypeChange = useCallback(
    (nextVtId: number) => {
      setVehicleTypeId(nextVtId);
      const vt = catalogs?.vehicle_types.find((v) => v.id === nextVtId);
      const matchingLot = findMatchingLotForVehicleType(catalogs?.lots ?? [], vt?.tenloai);
      if (matchingLot) {
        setSelectedLotId(matchingLot.id);
        setSlotId('');
        setCheckInEmpOverride('');
      }
    },
    [catalogs],
  );

  const selectedLot = useMemo(
    () => catalogs?.lots.find((l) => l.id === Number(effectiveLotId)),
    [catalogs, effectiveLotId],
  );

  const slotsForLot = useMemo(() => {
    if (!effectiveLotId) return availableSlots;
    return availableSlots.filter((s) => s.idbdx === Number(effectiveLotId));
  }, [availableSlots, effectiveLotId]);

  const effectiveSlotId = useMemo<number | ''>(() => {
    if (slotId && slotsForLot.some((s) => s.id === slotId)) return slotId;
    return slotsForLot[0]?.id ?? '';
  }, [slotId, slotsForLot]);

  const effectiveCardId = useMemo<number | ''>(() => {
    if (matchedPassCard) {
      if (cardId && checkInCards.some((c) => c.id === cardId)) return cardId;
      return matchedPassCard.id;
    }
    if (cardId && checkInCards.some((c) => c.id === cardId)) return cardId;
    return checkInCards[0]?.id ?? '';
  }, [cardId, checkInCards, matchedPassCard]);

  const turnCounts = useMemo(() => {
    let monthly = 0;
    let overdue = 0;
    activeTurns.forEach((t) => {
      if (isMonthlyTurn(t)) monthly += 1;
      if (getHoursParked(t.giovao) >= 24) overdue += 1;
    });
    return {
      all: activeTurns.length,
      daily: activeTurns.length - monthly,
      monthly,
      overdue,
    };
  }, [activeTurns]);

  const filteredTurns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeTurns.filter((t) => {
      if (quickFilter === 'daily' && isMonthlyTurn(t)) return false;
      if (quickFilter === 'monthly' && !isMonthlyTurn(t)) return false;
      if (quickFilter === 'overdue' && getHoursParked(t.giovao) < 24) return false;
      if (!q) return true;
      return (
        t.bienso.toLowerCase().includes(q) ||
        t.mathe.toLowerCase().includes(q) ||
        t.chu_xe.toLowerCase().includes(q) ||
        `${t.khuvuc}-${t.vitri}`.toLowerCase().includes(q)
      );
    });
  }, [activeTurns, search, quickFilter]);

  // POS keyboard shortcuts (F2 plate, F3 or / search, 1-3 vehicle type)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        plateInputRef.current?.focus();
        plateInputRef.current?.select();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (isTyping || checkoutTurn || moveTurn || cancelTurnTarget) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        const vt = catalogs?.vehicle_types[Number(e.key) - 1];
        if (vt) handleVehicleTypeChange(vt.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [catalogs, checkoutTurn, moveTurn, cancelTurnTarget, handleVehicleTypeChange]);

  const invalidateGateData = () => {
    void queryClient.invalidateQueries({ queryKey: ['turns'] });
    void queryClient.invalidateQueries({ queryKey: ['slots'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
    void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };

  const checkInMutation = useMutation({
    mutationFn: (vars: CheckInMutationVars) =>
      apiRequest<{ turn_id: number }>('/api/v1/turns/check-in', {
        method: 'POST',
        body: JSON.stringify({
          license_plate: vars.plate,
          vehicle_type_id: vars.vehicleTypeId,
          slot_id: vars.slotId,
          card_id: vars.cardId,
          employee_id: vars.employeeId,
        }),
      }),
    onSuccess: (res, vars) => {
      notify('ok', `Đã ghi nhận xe ${vars.plate} vào bãi (Lượt #${res.turn_id}).`);
      onPrint({
        kind: 'ticket',
        id: res.turn_id,
        plate: vars.plate,
        vehicleType: vars.vehicleTypeName,
        slotLabel: vars.slotLabel,
        cardCode: vars.cardCode,
        checkinTime: new Date().toISOString(),
        operatorName: vars.employeeName,
      });
      setPlate('');
      setVehicleTypeId('');
      setSlotId('');
      setCardId('');
      setCheckInEmpOverride('');
      invalidateGateData();
      window.setTimeout(() => plateInputRef.current?.focus(), 100);
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const checkOutMutation = useMutation({
    mutationFn: (vars: CheckOutMutationVars) =>
      apiRequest<FeeQuote>(`/api/v1/turns/${vars.turn.id_luotdo}/check-out`, {
        method: 'POST',
        body: JSON.stringify({
          employee_id: vars.employeeId,
          payment_method: vars.paymentMethod,
          lost_card: vars.lostCard,
          lost_card_fee: vars.lostCard ? vars.lostCardFee : 0,
          replacement_card_id: vars.lostCard ? vars.replacementCardId : null,
        }),
      }),
    onSuccess: (res, vars) => {
      notify('ok', `Đã check-out xe ${res.license_plate}.`);
      setCheckoutTurn(null);
      setLostCard(false);
      setReplacementCardId('');
      setCheckOutEmpOverride('');
      onPrint({
        kind: 'receipt',
        id: res.turn_id,
        plate: res.license_plate,
        vehicleType: res.vehicle_type,
        ticketType: res.ticket_type,
        cardCode: vars.turn.mathe,
        slotLabel: `${vars.turn.tenbaido} · ${vars.turn.khuvuc}-${vars.turn.vitri}`,
        checkinTime: res.checkin_time,
        checkoutTime: res.checkout_time,
        paymentMethod: res.payment_method ?? vars.paymentMethod,
        amount: res.amount,
        operatorName: vars.employeeName,
      });
      invalidateGateData();
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const moveSlotMutation = useMutation({
    mutationFn: ({ turnId, newSlotId }: { turnId: number; newSlotId: number }) =>
      apiRequest(`/api/v1/turns/${turnId}/move-slot`, {
        method: 'POST',
        body: JSON.stringify({ new_slot_id: newSlotId }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã chuyển vị trí đỗ thành công.');
      setMoveTurn(null);
      setTargetSlotId('');
      invalidateGateData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const cancelTurnMutation = useMutation({
    mutationFn: (turnId: number) =>
      apiRequest(`/api/v1/turns/${turnId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      notify('ok', 'Đã hủy lượt gửi xe và giải phóng vị trí.');
      setCancelTurnTarget(null);
      invalidateGateData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const handleCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveVehicleTypeId || !effectiveSlotId || !effectiveCardId || !effectiveCheckInEmpId) {
      notify('err', 'Vui lòng chọn đầy đủ loại xe, vị trí trống, thẻ RFID và nhân viên tiếp nhận.');
      return;
    }
    const vtId = Number(effectiveVehicleTypeId);
    const sId = Number(effectiveSlotId);
    const cId = Number(effectiveCardId);
    const empId = Number(effectiveCheckInEmpId);
    const vtName = catalogs?.vehicle_types.find((v) => v.id === vtId)?.tenloai;
    const slot = availableSlots.find((s) => s.id === sId);
    const card = checkInCards.find((c) => c.id === cId);
    const emp = employees.find((item) => item.id === empId);
    checkInMutation.mutate({
      plate: plate.trim().toUpperCase(),
      vehicleTypeId: vtId,
      slotId: sId,
      cardId: cId,
      employeeId: empId,
      employeeName: emp?.hoten,
      vehicleTypeName: vtName,
      slotLabel: slot ? `${slot.tenbaido} · ${slot.ten_khuvuc}-${slot.sothutu}` : undefined,
      cardCode: card?.maso,
    });
  };

  const openCheckoutModal = (turn: ActiveTurn) => {
    setCheckoutTurn(turn);
    setPaymentMethod('Tiền mặt');
    setLostCard(false);
    setLostCardFee(50000);
    setReplacementCardId('');
    setCheckOutEmpOverride('');
  };

  const busyTurnId =
    (checkOutMutation.isPending ? checkoutTurn?.id_luotdo : null) ??
    (moveSlotMutation.isPending ? moveTurn?.id_luotdo : null) ??
    (cancelTurnMutation.isPending ? cancelTurnTarget?.id_luotdo : null) ??
    null;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      <GateStatsStrip
        selectedLot={selectedLot}
        activeCount={turnCounts.all}
        monthlyCount={turnCounts.monthly}
        overdueCount={turnCounts.overdue}
        availableCardsCount={checkInCards.length}
        onFilterOverdue={() => setQuickFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-1 gap-4 items-stretch">
        <div className="xl:col-span-4 min-h-0 flex flex-col">
          <CheckInPanel
            plateInputRef={plateInputRef}
            plate={plate}
            onPlateChange={(val) => {
              setPlate(val);
              setCardId('');
            }}
            vehicleTypeId={effectiveVehicleTypeId}
            onVehicleTypeChange={handleVehicleTypeChange}
            selectedLotId={effectiveLotId}
            onLotChange={(id) => {
              setSelectedLotId(id);
              setSlotId('');
              setCheckInEmpOverride('');
            }}
            slotId={effectiveSlotId}
            onSlotChange={setSlotId}
            cardId={effectiveCardId}
            onCardChange={setCardId}
            employeeId={effectiveCheckInEmpId}
            onEmployeeChange={setCheckInEmpOverride}
            catalogs={catalogs}
            slotsForLot={slotsForLot}
            allAvailableSlots={availableSlots}
            onSelectSlotFromMap={(nextSlotId, nextLotId) => {
              setSelectedLotId(nextLotId);
              setSlotId(nextSlotId);
              setCheckInEmpOverride('');
            }}
            availableCards={checkInCards}
            matchedPassCard={matchedPassCard}
            submitting={checkInMutation.isPending}
            onSubmit={handleCheckIn}
          />
        </div>

        <div className="xl:col-span-8 min-h-0 flex flex-col">
          <ActiveTurnsTable
            searchInputRef={searchInputRef}
            search={search}
            onSearchChange={handleSearchChange}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            counts={turnCounts}
            turns={filteredTurns}
            totalCount={activeTurns.length}
            loading={turnsQuery.isLoading}
            error={turnsQuery.isError ? getErrorMessage(turnsQuery.error) : null}
            onRetry={() => void turnsQuery.refetch()}
            canManageTurns
            busyTurnId={busyTurnId}
            onOpenCheckout={openCheckoutModal}
            onOpenMoveSlot={(turn) => {
              setMoveTurn(turn);
              setTargetSlotId('');
            }}
            onRequestCancel={setCancelTurnTarget}
            onPrintTicket={(turn) =>
              onPrint({
                kind: 'ticket',
                id: turn.id_luotdo,
                plate: turn.bienso,
                vehicleType: turn.loaiphuongtien,
                slotLabel: `${turn.tenbaido} · ${turn.khuvuc}-${turn.vitri}`,
                cardCode: turn.mathe,
                checkinTime: turn.giovao,
                operatorName: turn.nhanvien,
              })
            }
          />
        </div>
      </div>

      <CheckoutModal
        turn={checkoutTurn}
        quote={quoteQuery.data ?? null}
        loadingQuote={quoteQuery.isLoading}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        lostCard={lostCard}
        onLostCardChange={setLostCard}
        lostCardFee={lostCardFee}
        onLostCardFeeChange={setLostCardFee}
        replacementCardId={replacementCardId}
        onReplacementCardChange={setReplacementCardId}
        availableCards={walkinCards}
        employees={employees}
        employeeId={effectiveCheckOutEmpId}
        onEmployeeChange={setCheckOutEmpOverride}
        vietQrConfig={catalogs?.vietqr}
        submitting={checkOutMutation.isPending}
        onConfirm={() => {
          if (!checkoutTurn || !effectiveCheckOutEmpId) return;
          const empId = Number(effectiveCheckOutEmpId);
          const emp = employees.find((e) => e.id === empId);
          checkOutMutation.mutate({
            turn: checkoutTurn,
            paymentMethod,
            lostCard,
            lostCardFee,
            replacementCardId: replacementCardId ? Number(replacementCardId) : null,
            employeeId: empId,
            employeeName: emp?.hoten,
          });
        }}
        onClose={() => setCheckoutTurn(null)}
      />

      <MoveSlotModal
        turn={moveTurn}
        targetSlotId={targetSlotId}
        onTargetSlotChange={setTargetSlotId}
        availableSlots={availableSlots}
        submitting={moveSlotMutation.isPending}
        onConfirm={() => {
          if (moveTurn && targetSlotId) {
            moveSlotMutation.mutate({
              turnId: moveTurn.id_luotdo,
              newSlotId: Number(targetSlotId),
            });
          }
        }}
        onClose={() => setMoveTurn(null)}
      />

      <ConfirmDialog
        open={Boolean(cancelTurnTarget)}
        title="Hủy lượt gửi xe"
        message={
          cancelTurnTarget
            ? `Xác nhận hủy lượt #${cancelTurnTarget.id_luotdo} của xe ${cancelTurnTarget.bienso} và giải phóng ô đỗ cùng thẻ RFID?`
            : ''
        }
        confirmLabel="Hủy lượt xe"
        loading={cancelTurnMutation.isPending}
        onConfirm={() => cancelTurnTarget && cancelTurnMutation.mutate(cancelTurnTarget.id_luotdo)}
        onCancel={() => setCancelTurnTarget(null)}
      />
    </div>
  );
}
