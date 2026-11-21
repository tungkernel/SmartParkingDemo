import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect } from 'react';
import { formatDateTime, formatVnd } from '../lib/api';
import type { PrintableDocument } from '../types';
import { Modal } from './ui/Modal';

export type { PrintableDocument };

interface TicketPrintModalProps {
  doc: PrintableDocument | null;
  onClose: () => void;
}

export function TicketPrintModal({ doc, onClose }: TicketPrintModalProps) {
  useEffect(() => {
    if (!doc) return undefined;
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    const handleAfterPrint = () => onClose();
    window.addEventListener('keydown', handleKey);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [doc, onClose]);

  if (!doc) return null;

  const isTicket = doc.kind === 'ticket';
  const qrValue = JSON.stringify({
    type: doc.kind,
    id: doc.id,
    plate: doc.plate,
    card: doc.cardCode ?? '',
  });

  return (
    <Modal
      open={Boolean(doc)}
      onClose={onClose}
      rootId="print-modal-root"
      maxWidthClass="max-w-md"
      title={isTicket ? 'In phiếu gửi xe (80mm)' : 'In biên lai thanh toán (80mm)'}
      titleIcon={<Printer className="h-4 w-4 text-indigo-600" />}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Đóng (Esc)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-xs"
          >
            <Printer className="h-4 w-4" />
            In ngay (Ctrl+P)
          </button>
        </>
      }
    >
      <div className="p-6 bg-slate-100/70 dark:bg-slate-950/60 flex justify-center">
        <div
          id="print-ticket-area"
          className="w-[300px] rounded-xl border border-dashed border-slate-300 bg-white p-5 text-slate-900 shadow-xs"
        >
          <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Smart Parking PTIT
            </div>
            <h3 className="mt-1 text-base font-extrabold uppercase tracking-tight">
              {isTicket ? 'Phiếu Gửi Xe' : 'Biên Lai Thu Phí'}
            </h3>
            <div className="mt-0.5 text-xs text-slate-500">Mã #{doc.id}</div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Biển số:</span>
              <span className="font-mono-plate font-bold text-sm">{doc.plate}</span>
            </div>
            {doc.vehicleType && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Loại xe:</span>
                <span className="font-medium">{doc.vehicleType}</span>
              </div>
            )}
            {doc.cardCode && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Mã thẻ RFID:</span>
                <span className="font-mono-plate font-semibold">{doc.cardCode}</span>
              </div>
            )}
            {doc.slotLabel && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Vị trí đỗ:</span>
                <span className="font-semibold">{doc.slotLabel}</span>
              </div>
            )}
            {doc.ticketType && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Loại vé:</span>
                <span className="font-medium">{doc.ticketType}</span>
              </div>
            )}
            {doc.checkinTime && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Giờ vào:</span>
                <span>{formatDateTime(doc.checkinTime)}</span>
              </div>
            )}
            {doc.checkoutTime && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Giờ ra / TT:</span>
                <span>{formatDateTime(doc.checkoutTime)}</span>
              </div>
            )}
            {doc.paymentMethod && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Hình thức:</span>
                <span>{doc.paymentMethod}</span>
              </div>
            )}
            {doc.operatorName && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Nhân viên:</span>
                <span>{doc.operatorName}</span>
              </div>
            )}
          </div>

          {!isTicket && doc.amount !== undefined && (
            <div className="mt-3 pt-3 border-t border-dashed border-slate-300 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-600">Tổng thu</span>
              <span className="text-lg font-extrabold text-slate-900">{formatVnd(doc.amount)}</span>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-dashed border-slate-300 flex flex-col items-center">
            <QRCodeSVG value={qrValue} size={92} level="M" />
            <p className="mt-2 text-[10px] text-center text-slate-500">
              {isTicket
                ? 'Vui lòng giữ phiếu hoặc thẻ RFID để đối chiếu khi lấy xe.'
                : 'Cảm ơn quý khách đã sử dụng dịch vụ!'}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
