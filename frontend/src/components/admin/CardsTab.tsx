import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CreditCard, Plus, Radio, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { apiRequest, getErrorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { AuthUser, CardDetailRecord } from '../../types';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LicensePlate } from '../ui/LicensePlate';
import { SearchInput } from '../ui/SearchInput';
import { TableSkeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';

type CardStatusFilter = 'all' | '1' | '0' | '2';

interface CardsTabProps {
  user?: AuthUser;
}

export function CardsTab({ user }: CardsTabProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const codeId = useId();

  const [newCode, setNewCode] = useState('');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CardDetailRecord | null>(null);
  const isAdmin = user?.role === 'ADMIN';

  const urlStatus = searchParams.get('status');
  const statusFilter: CardStatusFilter =
    urlStatus === '1' || urlStatus === '0' || urlStatus === '2' ? urlStatus : 'all';

  const setStatusFilter = (next: CardStatusFilter) => {
    const p = new URLSearchParams(searchParams);
    if (next === 'all') p.delete('status');
    else p.set('status', next);
    setSearchParams(p, { replace: true });
  };

  const cardsQuery = useQuery<CardDetailRecord[]>({
    queryKey: ['cards', 'detail'],
    queryFn: ({ signal }) =>
      apiRequest<CardDetailRecord[]>('/api/v1/cards?detail=true', { signal }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/cards', {
        method: 'POST',
        body: JSON.stringify({ code: newCode.trim() }),
      }),
    onSuccess: () => {
      notify('ok', `Đã phát hành thẻ #${newCode.trim()}.`);
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

  const deleteMutation = useMutation({
    mutationFn: (cardId: number) => apiRequest(`/api/v1/cards/${cardId}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('ok', 'Đã xóa thẻ RFID.');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const allCards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);

  const counts = useMemo(() => {
    let free = 0;
    let inUse = 0;
    let lost = 0;
    allCards.forEach((c) => {
      if (c.trangthai === 1) free += 1;
      else if (c.trangthai === 0) inUse += 1;
      else lost += 1;
    });
    return { total: allCards.length, free, inUse, lost };
  }, [allCards]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCards.filter((c) => {
      if (statusFilter !== 'all' && String(c.trangthai) !== statusFilter) return false;
      if (!q) return true;
      return (
        c.maso.toLowerCase().includes(q) ||
        (c.bienso_dang_gui?.toLowerCase().includes(q) ?? false) ||
        (c.bienso_ve_thang?.toLowerCase().includes(q) ?? false) ||
        (c.chu_ve_thang?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allCards, search, statusFilter]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      {/* Interactive Inventory Summary Cards */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            key: 'all' as const,
            label: 'Tổng thẻ RFID',
            value: counts.total,
            icon: <CreditCard className="h-4 w-4 text-brand-600 dark:text-brand-400" />,
            toneCls: 'text-slate-900 dark:text-slate-100',
          },
          {
            key: '1' as const,
            label: 'Sẵn sàng phát',
            value: counts.free,
            icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
            toneCls: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            key: '0' as const,
            label: 'Đang sử dụng',
            value: counts.inUse,
            icon: <Radio className="h-4 w-4 text-sky-500" />,
            toneCls: 'text-sky-700 dark:text-sky-400',
          },
          {
            key: '2' as const,
            label: 'Mất / Hỏng',
            value: counts.lost,
            icon: <AlertTriangle className="h-4 w-4 text-rose-500" />,
            toneCls: 'text-rose-600 dark:text-rose-400',
          },
        ].map((card) => {
          const active = statusFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setStatusFilter(active && card.key !== 'all' ? 'all' : card.key)}
              className={cn(
                'card-surface rounded-2xl p-3 text-left transition-all',
                active
                  ? 'ring-2 ring-brand-500 border-brand-500/60'
                  : 'hover:border-slate-300 dark:hover:border-slate-700',
              )}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{card.label}</span>
                {card.icon}
              </div>
              <div className={cn('mt-1 font-mono-plate text-xl font-extrabold', card.toneCls)}>
                {card.value}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Card Table + Issue Form */}
      <div className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[300px] max-h-[68vh] lg:max-h-none flex flex-col">
        <div className="shrink-0 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
          <SearchInput
            containerClassName="w-64 sm:w-72"
            aria-label="Tìm thẻ theo mã thẻ, biển số hoặc chủ vé"
            value={search}
            onChange={setSearch}
            placeholder="Tìm mã thẻ, biển số, chủ vé..."
          />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newCode.trim()) createMutation.mutate();
            }}
            className="flex flex-wrap items-end gap-2 text-xs"
          >
            <div>
              <label htmlFor={codeId} className="sr-only">
                Mã thẻ RFID mới (tối đa 10 ký tự)
              </label>
              <input
                id={codeId}
                required
                maxLength={10}
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Mã thẻ mới (VD: 055)"
                className="font-mono-plate h-9 w-44 rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 text-xs font-semibold focus:border-brand-500 outline-none"
              />
            </div>
            <Button
              type="submit"
              size="md"
              loading={createMutation.isPending}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              {createMutation.isPending ? 'Đang thêm...' : 'Phát hành thẻ'}
            </Button>
          </form>
        </div>

        <div className="flex-1 min-h-0 scroll-pane">
          {cardsQuery.isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : cardsQuery.isError ? (
            <div className="p-5">
              <ErrorState
                message={getErrorMessage(cardsQuery.error)}
                onRetry={() => void cardsQuery.refetch()}
              />
            </div>
          ) : filteredCards.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-5 w-5" />}
              title="Không có thẻ RFID nào khớp bộ lọc"
              description="Thử chọn trạng thái Tất cả hoặc xóa từ khóa tìm kiếm."
            />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Mã thẻ</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Trạng thái</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Xe đang gửi</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Gắn vé tháng</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredCards.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-3.5 py-2.5 font-mono-plate font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      #{c.maso}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <StatusBadge
                        dot
                        tone={c.trangthai === 1 ? 'emerald' : c.trangthai === 0 ? 'sky' : 'rose'}
                      >
                        {c.trangthai === 1
                          ? 'Sẵn sàng'
                          : c.trangthai === 0
                            ? 'Đang dùng'
                            : 'Mất / Hỏng'}
                      </StatusBadge>
                    </td>
                    <td className="px-3.5 py-2.5">
                      {c.bienso_dang_gui ? (
                        <div className="flex items-center gap-2">
                          <LicensePlate plate={c.bienso_dang_gui} size="xs" />
                          <span className="text-xs text-slate-500">
                            {c.tenbaido} · {c.khuvuc}-{c.sothutu}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {c.ma_ve_thang ? (
                        <div className="text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {c.chu_ve_thang}
                          </span>{' '}
                          <span className="font-mono-plate text-slate-500">
                            ({c.bienso_ve_thang})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      {c.trangthai !== 0 && (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({ id: c.id, status: c.trangthai === 1 ? 2 : 1 })
                            }
                            className={cn(
                              'whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
                              c.trangthai === 1
                                ? 'border-rose-200 dark:border-rose-900/80 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                : 'border-emerald-200 dark:border-emerald-900/80 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
                            )}
                          >
                            {c.trangthai === 1 ? 'Báo mất/hỏng' : 'Khôi phục'}
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              aria-label={`Xóa thẻ #${c.maso}`}
                              onClick={() => setDeleteTarget(c)}
                              className="rounded-xl border border-rose-200 dark:border-rose-900/80 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Xóa thẻ RFID #${deleteTarget.maso}` : 'Xóa thẻ RFID'}
        message={
          deleteTarget
            ? `Xác nhận xóa thẻ #${deleteTarget.maso}? Hệ thống chỉ cho phép xóa nếu thẻ chưa từng phát sinh lượt gửi hoặc vé tháng.`
            : ''
        }
        confirmLabel="Xóa thẻ"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
