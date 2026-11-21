import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { apiRequest, getErrorMessage } from '../../lib/api';
import type { CardDetailRecord } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

export function CardsTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const codeId = useId();
  const [newCode, setNewCode] = useState('');

  const cardsQuery = useQuery<CardDetailRecord[]>({
    queryKey: ['cards', 'detail'],
    queryFn: ({ signal }) => apiRequest<CardDetailRecord[]>('/api/v1/cards?detail=true', { signal }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/cards', {
        method: 'POST',
        body: JSON.stringify({ code: newCode }),
      }),
    onSuccess: () => {
      notify('ok', `Đã phát hành thẻ #${newCode}.`);
      setNewCode('');
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 1 | 2 }) =>
      apiRequest(`/api/v1/cards/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã cập nhật trạng thái thẻ.');
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newCode.trim()) createMutation.mutate();
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-xs"
      >
        <div>
          <label htmlFor={codeId} className="block font-semibold mb-1">
            Mã thẻ RFID mới (tối đa 10 ký tự)
          </label>
          <input
            id={codeId}
            required
            maxLength={10}
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="VD: 055"
            className="font-mono-plate rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {createMutation.isPending ? 'Đang thêm...' : 'Phát hành thẻ'}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Mã thẻ</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Xe đang gửi</th>
                <th className="px-4 py-3">Gắn vé tháng</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(cardsQuery.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono-plate font-bold">#{c.maso}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={c.trangthai === 1 ? 'emerald' : c.trangthai === 0 ? 'amber' : 'rose'}>
                      {c.trangthai === 1 ? 'Sẵn sàng' : c.trangthai === 0 ? 'Đang dùng' : 'Mất / Hỏng'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    {c.bienso_dang_gui ? (
                      <span className="font-mono-plate font-semibold">
                        {c.bienso_dang_gui} ({c.tenbaido} · {c.khuvuc}-{c.sothutu})
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.ma_ve_thang ? `${c.chu_ve_thang} (${c.bienso_ve_thang})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.trangthai !== 0 && (
                      <button
                        type="button"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({ id: c.id, status: c.trangthai === 1 ? 2 : 1 })
                        }
                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        {c.trangthai === 1 ? 'Báo mất/hỏng' : 'Khôi phục'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
