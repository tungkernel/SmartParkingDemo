import { Banknote, CreditCard, PlusCircle, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useId, useMemo, useState } from 'react';
import { formatVnd } from '../../lib/api';
import { cn } from '../../lib/cn';
import { buildVietQrPayload } from '../../lib/vietqr';
import type { CardRecord, CatalogsResponse, PaymentMethod, Tariff } from '../../types';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

export interface RegisterPassPayload {
  hoten: string;
  sdt: string;
  cccd: string;
  customerTypeId: number;
  plate: string;
  vehicleTypeId: number;
  cardId: number;
  months: number;
  payMethod: PaymentMethod;
  estimatedAmount: number;
  cardCode?: string;
  vehicleTypeName?: string;
}

interface RegisterPassDrawerProps {
  open: boolean;
  onClose: () => void;
  catalogs: CatalogsResponse | undefined;
  tariffs: Tariff[];
  cards: CardRecord[];
  submitting: boolean;
  onSubmit: (payload: RegisterPassPayload, resetForm: () => void) => void;
}

const MONTH_PRESETS = [1, 3, 6, 12] as const;

export function RegisterPassDrawer({
  open,
  onClose,
  catalogs,
  tariffs,
  cards,
  submitting,
  onSubmit,
}: RegisterPassDrawerProps) {
  const prefix = useId();
  const [hoten, setHoten] = useState('');
  const [sdt, setSdt] = useState('');
  const [cccd, setCccd] = useState('');
  const [custTypeId, setCustTypeId] = useState<number | ''>('');
  const [plate, setPlate] = useState('');
  const [vehTypeId, setVehTypeId] = useState<number | ''>('');
  const [cardId, setCardId] = useState<number | ''>('');
  const [months, setMonths] = useState(1);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Tiền mặt');

  const effectiveVehTypeId = vehTypeId || catalogs?.vehicle_types[0]?.id || '';
  const effectiveCustTypeId = custTypeId || catalogs?.customer_types[0]?.id || '';
  const effectiveCardId =
    cardId && cards.some((c) => c.id === cardId) ? cardId : (cards[0]?.id ?? '');

  const estimatedUnitPrice = useMemo(() => {
    const match = tariffs.find(
      (t) =>
        t.loaive === 'tháng' &&
        t.idlpt === Number(effectiveVehTypeId) &&
        t.idlkh === Number(effectiveCustTypeId),
    );
    return match ? match.dongia : 0;
  }, [tariffs, effectiveVehTypeId, effectiveCustTypeId]);

  const totalAmount = estimatedUnitPrice * months;
  const vietQrPayload = buildVietQrPayload({
    config: catalogs?.vietqr,
    amount: totalAmount,
    description: `PTIT PASS ${plate.trim().toUpperCase() || 'NEW'} ${months}M`,
  });

  const resetForm = () => {
    setHoten('');
    setSdt('');
    setCccd('');
    setPlate('');
    setCardId('');
    setMonths(1);
    setPayMethod('Tiền mặt');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cId = Number(effectiveCardId);
    const vId = Number(effectiveVehTypeId);
    const custId = Number(effectiveCustTypeId);
    onSubmit(
      {
        hoten: hoten.trim(),
        sdt: sdt.trim(),
        cccd: cccd.trim(),
        customerTypeId: custId,
        plate: plate.trim().toUpperCase(),
        vehicleTypeId: vId,
        cardId: cId,
        months,
        payMethod,
        estimatedAmount: totalAmount,
        cardCode: cards.find((c) => c.id === cId)?.maso,
        vehicleTypeName: catalogs?.vehicle_types.find((v) => v.id === vId)?.tenloai,
      },
      resetForm,
    );
  };

  const formId = `${prefix}-register-form`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Đăng ký vé tháng mới"
      titleIcon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
          <PlusCircle className="h-4 w-4" />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>
            Đóng
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={submitting}
            disabled={!effectiveCardId}
          >
            {submitting ? 'Đang đăng ký...' : 'Đăng ký & In biên lai'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleFormSubmit} className="p-5 space-y-4 text-xs">
        <div>
          <label
            htmlFor={`${prefix}-name`}
            className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Họ tên khách hàng
          </label>
          <input
            id={`${prefix}-name`}
            required
            maxLength={60}
            value={hoten}
            onChange={(e) => setHoten(e.target.value)}
            placeholder="Nguyễn Văn A"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3.5 py-2.5 text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${prefix}-sdt`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Số điện thoại
            </label>
            <input
              id={`${prefix}-sdt`}
              required
              minLength={8}
              maxLength={20}
              value={sdt}
              onChange={(e) => setSdt(e.target.value)}
              placeholder="0912345678"
              className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2.5 text-[13px] focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-cccd`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Số CCCD
            </label>
            <input
              id={`${prefix}-cccd`}
              required
              minLength={9}
              maxLength={15}
              value={cccd}
              onChange={(e) => setCccd(e.target.value)}
              placeholder="001204000123"
              className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2.5 text-[13px] focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${prefix}-cust`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Đối tượng khách hàng
            </label>
            <select
              id={`${prefix}-cust`}
              value={effectiveCustTypeId}
              onChange={(e) => setCustTypeId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2.5 text-[13px]"
            >
              {(catalogs?.customer_types ?? []).map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.tenloai}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-veh`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Loại phương tiện
            </label>
            <select
              id={`${prefix}-veh`}
              value={effectiveVehTypeId}
              onChange={(e) => setVehTypeId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2.5 text-[13px]"
            >
              {(catalogs?.vehicle_types ?? []).map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.tenloai}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${prefix}-plate`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Biển số xe
            </label>
            <input
              id={`${prefix}-plate`}
              required
              maxLength={15}
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="29A-123.45"
              className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2.5 text-[13px] font-bold uppercase focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-card`}
              className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              <CreditCard className="h-3.5 w-3.5 text-slate-400" />
              Thẻ RFID trống ({cards.length})
            </label>
            <select
              id={`${prefix}-card`}
              value={effectiveCardId}
              onChange={(e) => setCardId(Number(e.target.value))}
              className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2.5 text-[13px] font-semibold"
            >
              {cards.length === 0 ? (
                <option value="">Hết thẻ trống</option>
              ) : (
                cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.maso}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Duration Quick Chips */}
        <div>
          <label
            htmlFor={`${prefix}-months`}
            className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Thời hạn đăng ký (1–12 tháng)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1.5">
              {MONTH_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={cn(
                    'flex-1 rounded-xl border py-2 text-xs font-bold transition-colors',
                    months === m
                      ? 'bg-brand-soft'
                      : 'border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:border-brand-400',
                  )}
                >
                  {m}T
                </button>
              ))}
            </div>
            <input
              id={`${prefix}-months`}
              type="number"
              min={1}
              max={12}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Math.min(12, Number(e.target.value))))}
              className="w-16 rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-2.5 py-2 text-center font-mono-plate text-xs font-bold"
            />
          </div>
        </div>

        {/* Payment Method */}
        <div>
          <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Phương thức thanh toán
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            {(['Tiền mặt', 'Chuyển khoản'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPayMethod(method)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-all',
                  payMethod === method
                    ? 'bg-brand-soft'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                {method === 'Tiền mặt' ? (
                  <Banknote className="h-4 w-4" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
                {method}
              </button>
            ))}
          </div>
        </div>

        {/* VietQR Preview for Transfer */}
        {payMethod === 'Chuyển khoản' && totalAmount > 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-sky-200 dark:border-sky-900/70 bg-sky-50/40 dark:bg-sky-950/25 p-4 text-center">
            <div className="rounded-xl bg-white p-2.5 shadow-sm">
              <QRCodeSVG value={vietQrPayload} size={136} level="M" />
            </div>
            <div className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-100">
              VietQR — {catalogs?.vietqr.account_name ?? 'SMART PARKING PTIT'}
            </div>
            <div className="font-mono-plate text-[11px] text-slate-500">
              BIN {catalogs?.vietqr.bank_bin ?? '970422'} · STK{' '}
              {catalogs?.vietqr.account_no ?? '0123456789'}
            </div>
          </div>
        )}

        {/* Total Summary */}
        <div className="rounded-2xl bg-slate-900 dark:bg-slate-950 border border-slate-800 px-4 py-3.5 text-white">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Đơn giá: {formatVnd(estimatedUnitPrice)} / tháng</span>
            <span>× {months} tháng</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Tổng tiền thu
            </span>
            <span className="font-mono-plate text-xl font-extrabold">{formatVnd(totalAmount)}</span>
          </div>
        </div>
      </form>
    </Drawer>
  );
}
