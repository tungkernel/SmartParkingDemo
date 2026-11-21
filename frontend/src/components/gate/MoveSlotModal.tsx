import { ArrowRightLeft } from 'lucide-react';
import { useId } from 'react';
import type { ActiveTurn, ParkingSlot } from '../../types';
import { Modal } from '../ui/Modal';

interface MoveSlotModalProps {
  turn: ActiveTurn | null;
  targetSlotId: number | '';
  onTargetSlotChange: (id: number | '') => void;
  availableSlots: ParkingSlot[];
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function MoveSlotModal({
  turn,
  targetSlotId,
  onTargetSlotChange,
  availableSlots,
  submitting,
  onConfirm,
  onClose,
}: MoveSlotModalProps) {
  const selectId = useId();
  if (!turn) return null;

  return (
    <Modal
      open={Boolean(turn)}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={`Chuyển vị trí cho xe ${turn.bienso}`}
      titleIcon={<ArrowRightLeft className="h-4 w-4 text-indigo-600" />}
      footer={
        <>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting || !targetSlotId}
            onClick={onConfirm}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Đang chuyển...' : 'Xác nhận chuyển'}
          </button>
        </>
      }
    >
      <div className="p-5 space-y-3">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Vị trí hiện tại:{' '}
          <strong className="text-slate-800 dark:text-slate-100">
            {turn.tenbaido} — Khu {turn.khuvuc} Ô {turn.vitri}
          </strong>
        </div>
        <div>
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5"
          >
            Chọn ô đỗ trống mới
          </label>
          <select
            id={selectId}
            value={targetSlotId}
            onChange={(e) => onTargetSlotChange(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm"
          >
            <option value="">-- Chọn vị trí đích --</option>
            {availableSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.tenbaido} · Khu {slot.ten_khuvuc} — Ô {slot.sothutu}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
