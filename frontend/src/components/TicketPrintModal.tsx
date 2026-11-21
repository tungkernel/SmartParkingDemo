import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect } from 'react';
import { formatDateTime, formatVnd } from '../lib/api';
import type { PrintableDocument } from '../types';
import { Button } from './ui/Button';
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
      subtitle="Bản xem trước khổ giấy in nhiệt 80mm chuẩn"
      titleIcon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
          <Printer className="h-4 w-4" />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng (Esc)
          </Button>
          <Button
            variant="primary"
            icon={<Printer className="h-4 w-4" />}
            onClick={() => window.print()}
          >
            In ngay (Ctrl+P)
          </Button>
        </>
      }
    >
      <div className="p-6 bg-slate-200/70 dark:bg-slate-950/80 flex justify-center">
        <div
          id="print-ticket-area"
          className="w-[300px] rounded-xl border border-dashed border-slate-300 bg-white p-5 text-slate-900 shadow-lg"
        >
          <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Smart Parking PTIT
            </div>
            <h3 className="mt-1 text-base font-extrabold uppercase tracking-tight text-slate-950">
              {isTicket ? 'Phiếu Gửi Xe' : 'Biên Lai Thu Phí'}
            </h3>
            <div className="mt-0.5 font-mono-plate text-xs text-slate-500">Mã #{doc.id}</div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2 items-center">
              <span className="text-slate-500">Biển số:</span>
              <span className="font-mono-plate font-extrabold text-sm tracking-wider text-slate-950">
                {doc.plate}
              </span>
            </div>
            {doc.vehicleType && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Loại xe:</span>
                <span className="font-medium capitalize">{doc.vehicleType}</span>
              </div>
            )}
            {doc.cardCode && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Mã thẻ RFID:</span>
                <span className="font-mono-plate font-semibold">#{doc.cardCode}</span>
              </div>
            )}
            {doc.slotLabel && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Vị trí đỗ:</span>
                <span className="font-semibold text-right">{doc.slotLabel}</span>
              </div>
            )}
            {doc.ticketType && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Loại vé:</span>
                <span className="font-medium text-right">{doc.ticketType}</span>
              </div>
            )}
            {doc.checkinTime && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Giờ vào:</span>
                <span className="tabular-nums">{formatDateTime(doc.checkinTime)}</span>
              </div>
            )}
            {doc.checkoutTime && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Giờ ra / TT:</span>
                <span className="tabular-nums">{formatDateTime(doc.checkoutTime)}</span>
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
              <span className="font-mono-plate text-lg font-extrabold text-slate-950">
                {formatVnd(doc.amount)}
              </span>
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
