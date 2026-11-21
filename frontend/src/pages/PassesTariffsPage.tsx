import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Edit3, PlusCircle, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { PrintableDocument } from '../components/TicketPrintModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDate, formatVnd, getErrorMessage } from '../lib/api';
import type {
  AuthUser,
  CardRecord,
  CatalogsResponse,
  MonthlyPass,
  PaginatedResponse,
  PaymentMethod,
  Tariff,
} from '../types';

interface RegisterPassVars {
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

interface RenewPassVars {
  pass: MonthlyPass;
  renewM: number;
  method: PaymentMethod;
}

interface PassesTariffsPageProps {
  user: AuthUser;
  onPrint: (doc: PrintableDocument) => void;
}

export function PassesTariffsPage({ user, onPrint }: PassesTariffsPageProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const formIdPrefix = useId();

  // Filters & pagination
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'expired'>('');
  const [keyword, setKeyword] = useState('');

  // Register pass form
  const [hoten, setHoten] = useState('');
  const [sdt, setSdt] = useState('');
  const [cccd, setCccd] = useState('');
  const [custTypeId, setCustTypeId] = useState<number | ''>('');
  const [plate, setPlate] = useState('');
  const [vehTypeId, setVehTypeId] = useState<number | ''>('');
  const [cardId, setCardId] = useState<number | ''>('');
  const [months, setMonths] = useState(1);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Tiền mặt');

  // Modals
  const [renewTarget, setRenewTarget] = useState<MonthlyPass | null>(null);
  const [renewMonths, setRenewMonths] = useState(1);
  const [renewPayMethod, setRenewPayMethod] = useState<PaymentMethod>('Tiền mặt');
  const [cancelTarget, setCancelTarget] = useState<MonthlyPass | null>(null);
  const [editTariffTarget, setEditTariffTarget] = useState<Tariff | null>(null);
  const [editTariffPrice, setEditTariffPrice] = useState(0);

  const passParams = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), page_size: '25' });
    if (statusFilter) p.set('status_filter', statusFilter);
    if (keyword.trim()) p.set('keyword', keyword.trim());
    return p.toString();
  }, [page, statusFilter, keyword]);

  const passesQuery = useQuery<PaginatedResponse<MonthlyPass>>({
    queryKey: ['passes', passParams],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<MonthlyPass>>(`/api/v1/passes?${passParams}`, { signal }),
  });

  const tariffsQuery = useQuery<Tariff[]>({
    queryKey: ['tariffs'],
    queryFn: ({ signal }) => apiRequest<Tariff[]>('/api/v1/tariffs', { signal }),
  });

  const catalogsQuery = useQuery<CatalogsResponse>({
    queryKey: ['catalogs'],
    queryFn: ({ signal }) => apiRequest<CatalogsResponse>('/api/v1/catalogs', { signal }),
    staleTime: 60_000,
  });

  const cardsQuery = useQuery<CardRecord[]>({
    queryKey: ['cards', 'available'],
    queryFn: ({ signal }) =>
      apiRequest<CardRecord[]>('/api/v1/cards?only_available=true', { signal }),
  });

  const catalogs = catalogsQuery.data;
  const tariffs = useMemo(() => tariffsQuery.data ?? [], [tariffsQuery.data]);
  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);

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

  const invalidatePassData = () => {
    void queryClient.invalidateQueries({ queryKey: ['passes'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };

  const registerMutation = useMutation({
    mutationFn: (vars: RegisterPassVars) =>
      apiRequest<{ id: number }>('/api/v1/passes', {
        method: 'POST',
        body: JSON.stringify({
          hoten: vars.hoten,
          sdt: vars.sdt,
          cccd: vars.cccd,
          customer_type_id: vars.customerTypeId,
          license_plate: vars.plate,
          vehicle_type_id: vars.vehicleTypeId,
          card_id: vars.cardId,
          months: vars.months,
          payment_method: vars.payMethod,
        }),
      }),
    onSuccess: (res, vars) => {
      notify('ok', `Đăng ký vé tháng #${res.id} thành công!`);
      onPrint({
        kind: 'receipt',
        id: `VT-${res.id}`,
        plate: vars.plate,
        vehicleType: vars.vehicleTypeName,
        cardCode: vars.cardCode,
        ticketType: `Đăng ký vé tháng (${vars.months} tháng)`,
        checkoutTime: new Date().toISOString(),
        paymentMethod: vars.payMethod,
        amount: vars.estimatedAmount,
        operatorName: user.full_name,
      });
      setHoten('');
      setSdt('');
      setCccd('');
      setPlate('');
      setCardId('');
      invalidatePassData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const renewMutation = useMutation({
    mutationFn: (vars: RenewPassVars) =>
      apiRequest<{ pass_id: number; new_end_date: string; amount: number }>(
        `/api/v1/passes/${vars.pass.id}/renew`,
        {
          method: 'POST',
          body: JSON.stringify({ months: vars.renewM, payment_method: vars.method }),
        },
      ),
    onSuccess: (res, vars) => {
      notify('ok', `Gia hạn vé #${res.pass_id} đến ${formatDate(res.new_end_date)}.`);
      onPrint({
        kind: 'receipt',
        id: `GH-${res.pass_id}`,
        plate: vars.pass.bienso,
        vehicleType: vars.pass.loaiphuongtien,
        cardCode: vars.pass.mathe,
        ticketType: `Gia hạn vé tháng (+${vars.renewM} tháng)`,
        checkoutTime: new Date().toISOString(),
        paymentMethod: vars.method,
        amount: res.amount,
        operatorName: user.full_name,
      });
      setRenewTarget(null);
      invalidatePassData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const cancelPassMutation = useMutation({
    mutationFn: (passId: number) =>
      apiRequest(`/api/v1/passes/${passId}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('ok', 'Đã hủy hiệu lực vé tháng.');
      setCancelTarget(null);
      invalidatePassData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const updateTariffMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiRequest(`/api/v1/tariffs/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ unit_price: price }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã cập nhật đơn giá.');
      setEditTariffTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['tariffs'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const canManage = user.role === 'ADMIN' || user.role === 'ACCOUNTANT';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Register Monthly Pass Form */}
        <section className="xl:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <PlusCircle className="h-4 w-4 text-indigo-600" />
            Đăng ký vé tháng mới
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cId = Number(effectiveCardId);
              const vId = Number(effectiveVehTypeId);
              const custId = Number(effectiveCustTypeId);
              registerMutation.mutate({
                hoten,
                sdt,
                cccd,
                customerTypeId: custId,
                plate: plate.trim().toUpperCase(),
                vehicleTypeId: vId,
                cardId: cId,
                months,
                payMethod,
                estimatedAmount: estimatedUnitPrice * months,
                cardCode: cards.find((c) => c.id === cId)?.maso,
                vehicleTypeName: catalogs?.vehicle_types.find((v) => v.id === vId)?.tenloai,
              });
            }}
            className="space-y-3 text-xs"
          >
            <div>
              <label htmlFor={`${formIdPrefix}-name`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Họ tên khách hàng
              </label>
              <input
                id={`${formIdPrefix}-name`}
                required
                maxLength={60}
                value={hoten}
                onChange={(e) => setHoten(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor={`${formIdPrefix}-sdt`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Số điện thoại
                </label>
                <input
                  id={`${formIdPrefix}-sdt`}
                  required
                  minLength={8}
                  maxLength={20}
                  value={sdt}
                  onChange={(e) => setSdt(e.target.value)}
                  placeholder="0912345678"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor={`${formIdPrefix}-cccd`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Số CCCD
                </label>
                <input
                  id={`${formIdPrefix}-cccd`}
                  required
                  minLength={9}
                  maxLength={15}
                  value={cccd}
                  onChange={(e) => setCccd(e.target.value)}
                  placeholder="001204000123"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor={`${formIdPrefix}-cust`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Đối tượng
                </label>
                <select
                  id={`${formIdPrefix}-cust`}
                  value={effectiveCustTypeId}
                  onChange={(e) => setCustTypeId(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                >
                  {(catalogs?.customer_types ?? []).map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.tenloai}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${formIdPrefix}-veh`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Loại xe
                </label>
                <select
                  id={`${formIdPrefix}-veh`}
                  value={effectiveVehTypeId}
                  onChange={(e) => setVehTypeId(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                >
                  {(catalogs?.vehicle_types ?? []).map((vt) => (
                    <option key={vt.id} value={vt.id}>{vt.tenloai}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor={`${formIdPrefix}-plate`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Biển số xe
                </label>
                <input
                  id={`${formIdPrefix}-plate`}
                  required
                  maxLength={15}
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="29A-123.45"
                  className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-bold uppercase"
                />
              </div>
              <div>
                <label htmlFor={`${formIdPrefix}-card`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Thẻ RFID trống ({cards.length})
                </label>
                <select
                  id={`${formIdPrefix}-card`}
                  value={effectiveCardId}
                  onChange={(e) => setCardId(Number(e.target.value))}
                  className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                >
                  {cards.length === 0 ? (
                    <option value="">Hết thẻ trống</option>
                  ) : (
                    cards.map((c) => (
                      <option key={c.id} value={c.id}>#{c.maso}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor={`${formIdPrefix}-months`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Số tháng (1–12)
                </label>
                <input
                  id={`${formIdPrefix}-months`}
                  type="number"
                  min={1}
                  max={12}
                  value={months}
                  onChange={(e) => setMonths(Math.max(1, Math.min(12, Number(e.target.value))))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor={`${formIdPrefix}-pay`} className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Thanh toán
                </label>
                <select
                  id={`${formIdPrefix}-pay`}
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                >
                  <option value="Tiền mặt">Tiền mặt</option>
                  <option value="Chuyển khoản">Chuyển khoản</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 px-3.5 py-2.5">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">Ước tính thu:</span>
              <span className="text-base font-extrabold text-indigo-800 dark:text-indigo-200">
                {formatVnd(estimatedUnitPrice * months)}
              </span>
            </div>

            <button
              type="submit"
              disabled={registerMutation.isPending || !effectiveCardId}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {registerMutation.isPending ? 'Đang đăng ký...' : 'Đăng ký vé tháng & In biên lai'}
            </button>
          </form>
        </section>

        {/* Passes List */}
        <section className="xl:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <CreditCard className="h-4 w-4 text-indigo-600" />
              Danh sách vé tháng ({passesQuery.data?.total ?? 0})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  aria-label="Tìm vé tháng theo tên, biển số hoặc thẻ"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm tên, biển số, thẻ..."
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs outline-none"
                />
              </div>
              <select
                aria-label="Lọc trạng thái vé tháng"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as '' | 'active' | 'expired');
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Còn hạn</option>
                <option value="expired">Hết hạn</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {passesQuery.isLoading ? (
              <div className="p-10 text-center text-sm text-slate-400">Đang tải danh sách vé tháng...</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Khách hàng</th>
                    <th className="px-4 py-3">Biển số / Thẻ</th>
                    <th className="px-4 py-3">Hiệu lực</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(passesQuery.data?.items ?? []).map((p) => {
                    const isActive =
                      p.status_code ? p.status_code === 'active' : p.trangthai === 'Còn hạn';
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{p.hoten}</div>
                          <div className="text-[11px] text-slate-500">
                            {p.loaikhachhang} · {p.sdt}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono-plate font-bold">{p.bienso}</div>
                          <div className="text-[11px] text-slate-500">
                            {p.loaiphuongtien} · Thẻ #{p.mathe}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>{formatDate(p.ngaybatdau)} → {formatDate(p.ngayketthuc)}</div>
                          <div className="text-[11px] text-slate-500">{formatVnd(p.dongia)}/tháng</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={isActive ? 'emerald' : 'slate'}>
                            {isActive ? 'Còn hạn' : 'Hết hạn'}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setRenewTarget(p);
                                setRenewMonths(1);
                                setRenewPayMethod('Tiền mặt');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Gia hạn
                            </button>
                            {canManage && isActive && (
                              <button
                                type="button"
                                aria-label={`Hủy vé tháng #${p.id}`}
                                onClick={() => setCancelTarget(p)}
                                className="rounded-lg border border-rose-200 dark:border-rose-900 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {passesQuery.data && (
            <PaginationBar
              page={passesQuery.data.page}
              totalPages={passesQuery.data.total_pages}
              total={passesQuery.data.total}
              pageSize={passesQuery.data.page_size}
              onPageChange={setPage}
            />
          )}
        </section>
      </div>

      {/* Tariffs table */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <h2 className="text-sm font-bold">Bảng giá dịch vụ gửi xe ({tariffs.length} mức giá)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Loại vé</th>
                <th className="px-4 py-3">Loại phương tiện</th>
                <th className="px-4 py-3">Đối tượng khách hàng</th>
                <th className="px-4 py-3 text-right">Đơn giá</th>
                {canManage && <th className="px-4 py-3 text-right">Điều chỉnh</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tariffs.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-mono-plate">#{t.id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={t.loaive === 'tháng' ? 'indigo' : 'amber'}>
                      Vé {t.loaive}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 capitalize font-medium">{t.loaiphuongtien}</td>
                  <td className="px-4 py-3">{t.loaikhachhang}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatVnd(t.dongia)}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditTariffTarget(t);
                          setEditTariffPrice(t.dongia);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="h-3 w-3" />
                        Sửa giá
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Renew Modal */}
      <Modal
        open={Boolean(renewTarget)}
        onClose={() => setRenewTarget(null)}
        maxWidthClass="max-w-md"
        title={renewTarget ? `Gia hạn vé tháng #${renewTarget.id} (${renewTarget.bienso})` : ''}
        footer={
          <>
            <button
              type="button"
              onClick={() => setRenewTarget(null)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={renewMutation.isPending}
              onClick={() =>
                renewTarget &&
                renewMutation.mutate({
                  pass: renewTarget,
                  renewM: renewMonths,
                  method: renewPayMethod,
                })
              }
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {renewMutation.isPending ? 'Đang gia hạn...' : 'Xác nhận gia hạn'}
            </button>
          </>
        }
      >
        {renewTarget && (
          <div className="p-5 space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Hạn hiện tại:</span>
              <strong>{formatDate(renewTarget.ngayketthuc)}</strong>
            </div>
            <div>
              <label className="block font-semibold mb-1">Số tháng gia hạn</label>
              <select
                value={renewMonths}
                onChange={(e) => setRenewMonths(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
              >
                {[1, 2, 3, 6, 12].map((n) => (
                  <option key={n} value={n}>{n} tháng ({formatVnd(renewTarget.dongia * n)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Phương thức thanh toán</label>
              <select
                value={renewPayMethod}
                onChange={(e) => setRenewPayMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
              >
                <option value="Tiền mặt">Tiền mặt</option>
                <option value="Chuyển khoản">Chuyển khoản</option>
              </select>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Tariff Modal */}
      <Modal
        open={Boolean(editTariffTarget)}
        onClose={() => setEditTariffTarget(null)}
        maxWidthClass="max-w-sm"
        title={editTariffTarget ? `Cập nhật đơn giá #${editTariffTarget.id}` : ''}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditTariffTarget(null)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={updateTariffMutation.isPending}
              onClick={() =>
                editTariffTarget &&
                updateTariffMutation.mutate({ id: editTariffTarget.id, price: editTariffPrice })
              }
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {updateTariffMutation.isPending ? 'Đang lưu...' : 'Lưu đơn giá'}
            </button>
          </>
        }
      >
        {editTariffTarget && (
          <div className="p-5 space-y-3 text-xs">
            <div className="text-slate-600 dark:text-slate-300">
              Vé <strong>{editTariffTarget.loaive}</strong> — {editTariffTarget.loaiphuongtien} (
              {editTariffTarget.loaikhachhang})
            </div>
            <div>
              <label className="block font-semibold mb-1">Đơn giá mới (VNĐ)</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={editTariffPrice}
                onChange={(e) => setEditTariffPrice(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold"
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Hủy vé tháng trước hạn"
        message={
          cancelTarget
            ? `Xác nhận hủy vé tháng #${cancelTarget.id} của khách ${cancelTarget.hoten} (${cancelTarget.bienso})?`
            : ''
        }
        confirmLabel="Hủy vé tháng"
        loading={cancelPassMutation.isPending}
        onConfirm={() => cancelTarget && cancelPassMutation.mutate(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
