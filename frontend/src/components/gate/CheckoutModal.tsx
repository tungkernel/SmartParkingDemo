import { AlertTriangle, Banknote, LogOut, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useId } from 'react';
import { formatDateTime, formatVnd } from '../../lib/api';
import { buildVietQrPayload } from '../../lib/vietqr';
import type { ActiveTurn, CardRecord, FeeQuote, PaymentMethod, VietQrConfig } from '../../types';
import { Modal } from '../ui/Modal';

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
  vietQrConfig,
  submitting,
  onConfirm,
  onClose,
}: CheckoutModalProps) {
  const feeInputId = useId();
  const repCardId = useId();

  if (!turn) return null;

  const totalPay = (quote?.amount ?? 0) + (lostCard ? lostCardFee : 0);
  const vietQrPayload = buildVietQrPayload({
    config: vietQrConfig,
    amount: totalPay,
    description: `PTIT TURN ${turn.id_luotdo} ${turn.bienso}`,
  });

  return (
    <Modal
      open={Boolean(turn)}
      onClose={onClose}
      title={`Thanh toán & Check-out #${turn.id_luotdo}`}
      titleIcon={<LogOut className="h-4 w-4 text-indigo-600" />}
      footer={
        <>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting || loadingQuote || !quote}
            onClick={onConfirm}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Đang thanh toán...' : 'Xác nhận Check-out & In biên lai'}
          </button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        {loadingQuote || !quote ? (
          <div className="py-8 text-center text-sm text-slate-400">Đang tính phí gửi xe...</div>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Biển số:</span>
                <span className="font-mono-plate text-sm font-bold">{quote.license_plate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Loại xe / Vé:</span>
                <span className="font-semibold">
                  {quote.vehicle_type} · {quote.ticket_type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Giờ vào:</span>
                <span>{formatDateTime(quote.checkin_time)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Thời gian gửi:</span>
                <span className="font-semibold">{quote.duration_hours} giờ</span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/40 p-3.5 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lostCard}
                  onChange={(e) => onLostCardChange(e.target.checked)}
                  className="rounded border-amber-400"
                />
                <AlertTriangle className="h-3.5 w-3.5" />
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
                      className="w-full rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-semibold"
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
                        className="w-full rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono-plate"
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

            <div>
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Phương thức thanh toán
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {(['Tiền mặt', 'Chuyển khoản'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => onPaymentMethodChange(method)}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold cursor-pointer ${
                      paymentMethod === method
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
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

            {paymentMethod === 'Chuyển khoản' && totalPay > 0 && (
              <div className="flex flex-col items-center rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30 p-4">
                <div className="rounded-lg bg-white p-2.5 shadow-xs">
                  <QRCodeSVG value={vietQrPayload} size={140} level="M" />
                </div>
                <div className="mt-2 text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                  VietQR EMVCo — {vietQrConfig?.account_name ?? 'SMART PARKING PTIT'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-plate">
                  BIN {vietQrConfig?.bank_bin ?? '970422'} · STK {vietQrConfig?.account_no ?? '0123456789'}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl bg-slate-900 dark:bg-slate-800 px-4 py-3 text-white">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Tổng tiền thu
              </span>
              <span className="text-xl font-extrabold">{formatVnd(totalPay)}</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
