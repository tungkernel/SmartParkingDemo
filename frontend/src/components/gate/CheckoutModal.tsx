import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  LogOut,
  QrCode,
  UserCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useId, useState } from 'react';
import { formatDateTime, formatVnd } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatEmployeeOption } from '../../lib/employee';
import { buildVietQrPayload } from '../../lib/vietqr';
import type {
  ActiveTurn,
  CardRecord,
  CatalogEmployee,
  FeeQuote,
  PaymentMethod,
  VietQrConfig,
} from '../../types';
import { Button } from '../ui/Button';
import { LicensePlate } from '../ui/LicensePlate';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';

const CASH_CHIPS = [10000, 20000, 50000, 100000, 200000, 500000] as const;

interface CheckoutModalProps {
  turn: ActiveTurn | null;
  quote: FeeQuote | null;
  loadingQuote: boolean;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  lostCard: boolean;
  onLostCardChange: (val: boolean) => void;
  lostCardFee: number;
  onLostCardFeeChange: (val: number) => void;
  replacementCardId: number | '';
  onReplacementCardChange: (val: number | '') => void;
  availableCards: CardRecord[];
  employees: CatalogEmployee[];
  employeeId: number | '';
  onEmployeeChange: (val: number) => void;
  vietQrConfig?: VietQrConfig;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function CheckoutModal({
  turn,
  quote,
  loadingQuote,
  paymentMethod,
  onPaymentMethodChange,
  lostCard,
  onLostCardChange,
  lostCardFee,
  onLostCardFeeChange,
  replacementCardId,
  onReplacementCardChange,
  availableCards,
  employees,
  employeeId,
  onEmployeeChange,
  vietQrConfig,
  submitting,
  onConfirm,
  onClose,
}: CheckoutModalProps) {
  const feeInputId = useId();
  const repCardId = useId();
  const tenderId = useId();
  const cashierId = useId();

  const [cashDraft, setCashDraft] = useState<{ turnId: number; value: number | '' } | null>(null);
  const [copiedTurnId, setCopiedTurnId] = useState<number | null>(null);

  const cashTendered: number | '' =
    turn && cashDraft?.turnId === turn.id_luotdo ? cashDraft.value : '';
  const copiedDesc = Boolean(turn && copiedTurnId === turn.id_luotdo);

  const setCashTendered = (value: number | '') => {
    if (!turn) return;
    setCashDraft({ turnId: turn.id_luotdo, value });
  };

  // Ctrl+Enter quick submit inside CheckoutModal
  useEffect(() => {
    if (!turn) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && quote && !loadingQuote && !submitting) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [turn, quote, loadingQuote, submitting, onConfirm]);

  if (!turn) return null;

  const parkingFee = quote?.amount ?? 0;
  const penaltyFee = lostCard ? lostCardFee : 0;
  const totalPay = parkingFee + penaltyFee;
  const isFreePass = Boolean(quote?.is_monthly_pass) && totalPay === 0;
  const qrDescription = `PTIT TURN ${turn.id_luotdo} ${turn.bienso}`;

  const vietQrPayload = buildVietQrPayload({
    config: vietQrConfig,
    amount: totalPay,
    description: qrDescription,
  });

  const changeAmount = typeof cashTendered === 'number' ? cashTendered - totalPay : null;

  const copyTransferNote = () => {
    if (!navigator.clipboard) return;
    const currentId = turn.id_luotdo;
    void navigator.clipboard.writeText(qrDescription).then(() => {
      setCopiedTurnId(currentId);
      window.setTimeout(() => {
        setCopiedTurnId((prev) => (prev === currentId ? null : prev));
      }, 1500);
    });
  };

  return (
    <Modal
      open={Boolean(turn)}
      onClose={onClose}
      title={`Thanh toán & Check-out #${turn.id_luotdo}`}
      titleIcon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
          <LogOut className="h-4 w-4" />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>
            Hủy (Esc)
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={loadingQuote || !quote || !employeeId}
            onClick={onConfirm}
          >
            {submitting ? 'Đang thanh toán...' : 'Xác nhận Check-out & In biên lai'}
          </Button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        {loadingQuote || !quote ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {/* Turn Summary Card */}
            <div className="rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-slate-700/70">
                <LicensePlate plate={quote.license_plate} size="md" />
                <StatusBadge tone={quote.is_monthly_pass ? 'violet' : 'amber'} dot>
                  {quote.ticket_type}
                </StatusBadge>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Loại xe:</span>{' '}
                  <strong className="capitalize text-slate-800 dark:text-slate-100">
                    {quote.vehicle_type}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 dark:text-slate-400">Thời gian gửi:</span>{' '}
                  <strong className="font-mono-plate text-slate-800 dark:text-slate-100">
                    {quote.duration_hours} giờ
                  </strong>
                </div>
                <div className="col-span-2 flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Giờ vào:</span>
                  <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">
                    {formatDateTime(quote.checkin_time)}
                  </span>
                </div>
              </div>
            </div>

            {isFreePass && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                Miễn phí lượt gửi — xe thuộc diện Vé tháng đang còn hiệu lực.
              </div>
            )}

            {/* Lost Card Section */}
            <div className="rounded-xl border border-amber-200/90 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lostCard}
                  onChange={(e) => onLostCardChange(e.target.checked)}
                  className="rounded border-amber-400 accent-amber-600"
                />
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Khách báo mất thẻ RFID (khóa thẻ thành Mất/Hỏng & thu phụ phí)
              </label>

              {lostCard && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label
                      htmlFor={feeInputId}
                      className="block text-[11px] font-semibold text-amber-800 dark:text-amber-300 mb-1"
                    >
                      Phụ phí mất thẻ (VNĐ)
                    </label>
                    <input
                      id={feeInputId}
                      type="number"
                      min={0}
                      step={5000}
                      value={lostCardFee}
                      onChange={(e) => onLostCardFeeChange(Math.max(0, Number(e.target.value)))}
                      className="w-full rounded-xl border border-amber-300 dark:border-amber-800 bg-surface-input dark:bg-slate-900 px-3 py-2 text-sm font-bold tabular-nums"
                    />
                  </div>
                  {quote.monthly_pass_id && (
                    <div>
                      <label
                        htmlFor={repCardId}
                        className="block text-[11px] font-semibold text-amber-800 dark:text-amber-300 mb-1"
                      >
                        Cấp đổi thẻ mới cho vé tháng
                      </label>
                      <select
                        id={repCardId}
                        value={replacementCardId}
                        onChange={(e) =>
                          onReplacementCardChange(e.target.value ? Number(e.target.value) : '')
                        }
                        className="w-full rounded-xl border border-amber-300 dark:border-amber-800 bg-surface-input dark:bg-slate-900 px-3 py-2 text-xs font-mono-plate"
                      >
                        <option value="">Không cấp đổi ngay</option>
                        {availableCards.map((c) => (
                          <option key={c.id} value={c.id}>
                            Thẻ #{c.maso}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cashier Attribution (Option A) */}
            <div>
              <label
                htmlFor={cashierId}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                Nhân viên thu ngân
              </label>
              <select
                id={cashierId}
                value={employeeId}
                onChange={(e) => onEmployeeChange(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand-500 outline-none"
              >
                {employees.length === 0 ? (
                  <option value="">Chưa có nhân viên</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {formatEmployeeOption(emp)}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Payment Method */}
            {totalPay > 0 && (
              <div>
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Phương thức thanh toán
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['Tiền mặt', 'Chuyển khoản'] as const).map((method) => {
                    const active = paymentMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => onPaymentMethodChange(method)}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-all',
                          active
                            ? 'bg-brand-soft ring-1 ring-brand-500/40'
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
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Cash Tendered Calculator */}
            {paymentMethod === 'Tiền mặt' && totalPay > 0 && (
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={tenderId}
                    className="font-semibold text-slate-600 dark:text-slate-300"
                  >
                    Tiền khách đưa (tính tiền thối)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCashTendered(totalPay)}
                    className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Đủ tiền
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CASH_CHIPS.filter((c) => c >= totalPay).map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashTendered(amount)}
                      className={cn(
                        'rounded-lg border px-2 py-1 font-mono-plate text-[11px] font-semibold transition-colors',
                        cashTendered === amount
                          ? 'bg-brand-soft'
                          : 'border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-brand-400',
                      )}
                    >
                      {(amount / 1000).toLocaleString('vi-VN')}k
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id={tenderId}
                    type="number"
                    min={0}
                    step={1000}
                    value={cashTendered}
                    onChange={(e) =>
                      setCashTendered(
                        e.target.value === '' ? '' : Math.max(0, Number(e.target.value)),
                      )
                    }
                    placeholder="Nhập tiền khách đưa..."
                    className="w-40 rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-900 px-3 py-1.5 font-mono-plate text-xs font-bold outline-none focus:border-brand-500"
                  />
                  {changeAmount !== null && (
                    <div className="flex-1 text-right">
                      <span className="text-slate-500 dark:text-slate-400">Tiền thối: </span>
                      <span
                        className={cn(
                          'font-mono-plate text-sm font-extrabold',
                          changeAmount < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {changeAmount < 0
                          ? `Thiếu ${formatVnd(-changeAmount)}`
                          : formatVnd(changeAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VietQR Panel */}
            {paymentMethod === 'Chuyển khoản' && totalPay > 0 && (
              <div className="flex flex-col items-center rounded-2xl border border-sky-200/90 dark:border-sky-900/70 bg-sky-50/40 dark:bg-sky-950/25 p-4 text-center">
                <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
                  <QRCodeSVG value={vietQrPayload} size={148} level="M" />
                </div>
                <div className="mt-2.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                  VietQR EMVCo — {vietQrConfig?.account_name ?? 'SMART PARKING PTIT'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-plate mt-0.5">
                  BIN {vietQrConfig?.bank_bin ?? '970422'} · STK{' '}
                  {vietQrConfig?.account_no ?? '0123456789'}
                </div>
                <button
                  type="button"
                  onClick={copyTransferNote}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 px-2.5 py-1 text-[11px] font-mono-plate font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-400 transition-colors"
                >
                  {copiedDesc ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-slate-400" />
                  )}
                  {copiedDesc ? 'Đã sao chép nội dung CK' : qrDescription}
                </button>
              </div>
            )}

            {/* Total Breakdown Banner */}
            <div className="rounded-2xl bg-slate-900 dark:bg-slate-950 border border-slate-800 px-4 py-3.5 text-white space-y-1.5">
              {lostCard && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
                  <span>Phí gửi xe: {formatVnd(parkingFee)}</span>
                  <span>Phụ phí mất thẻ: +{formatVnd(penaltyFee)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Tổng tiền thu
                </span>
                <span className="font-mono-plate text-2xl font-extrabold tracking-tight">
                  {formatVnd(totalPay)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
