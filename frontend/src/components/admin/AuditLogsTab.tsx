import { useQuery } from '@tanstack/react-query';
import { Eye, History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { apiRequest, formatDateTime, getErrorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { AuditLog, PaginatedResponse } from '../../types';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { PaginationBar } from '../ui/PaginationBar';
import { SearchInput } from '../ui/SearchInput';
import { TableSkeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';
import { AuditLogDrawer } from './AuditLogDrawer';

const ACTION_PRESETS = [
  { label: 'Tất cả', value: '' },
  { label: 'Đăng nhập', value: 'LOGIN' },
  { label: 'Check-in', value: 'CHECK_IN' },
  { label: 'Check-out', value: 'CHECK_OUT' },
  { label: 'Vé tháng', value: 'PASS' },
  { label: 'Ca trực', value: 'SHIFT' },
] as const;

export function AuditLogsTab() {
  const [page, setPage] = useState(1);
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), page_size: '30' });
    if (actorFilter.trim()) p.set('actor_username', actorFilter.trim());
    if (actionFilter.trim()) p.set('action', actionFilter.trim());
    return p.toString();
  }, [page, actorFilter, actionFilter]);

  const query = useQuery<PaginatedResponse<AuditLog>>({
    queryKey: ['audit-logs', params],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<AuditLog>>(`/api/v1/audit-logs?${params}`, { signal }),
  });

  const items = query.data?.items ?? [];

  return (
    <div className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[320px] max-h-[72vh] lg:max-h-none flex flex-col">
      <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            containerClassName="w-56"
            aria-label="Lọc theo tài khoản thao tác"
            value={actorFilter}
            onChange={(val) => {
              setActorFilter(val);
              setPage(1);
            }}
            placeholder="Tài khoản (admin, baove...)"
          />
          <SearchInput
            containerClassName="w-72"
            aria-label="Lọc theo hành động"
            value={actionFilter}
            onChange={(val) => {
              setActionFilter(val.toUpperCase());
              setPage(1);
            }}
            placeholder="Mã hành động (CHECK_OUT, LOGIN...)"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ACTION_PRESETS.map((preset) => {
            const active = actionFilter === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setActionFilter(preset.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  active
                    ? 'bg-brand-soft'
                    : 'border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 scroll-pane">
        {query.isLoading ? (
          <TableSkeleton rows={7} cols={5} />
        ) : query.isError ? (
          <div className="p-5">
            <ErrorState
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="Không có bản ghi nhật ký kiểm toán khớp bộ lọc"
            description="Thử xóa lọc tài khoản hoặc chuyển sang nhóm Tất cả."
          />
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Thời gian</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Tài khoản / IP</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Hành động</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Đối tượng</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">Chi tiết</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Xem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {items.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="cursor-pointer hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-xs text-slate-500 tabular-nums">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="font-mono-plate font-bold text-slate-900 dark:text-slate-100">
                      @{log.actor_username}
                    </div>
                    {log.ip_address && (
                      <div className="text-[10px] text-slate-400 font-mono-plate">
                        {log.ip_address}
                      </div>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <StatusBadge
                      tone={
                        log.action.includes('DELETE') ||
                        log.action.includes('FAILED') ||
                        log.action.includes('CANCEL')
                          ? 'rose'
                          : log.action.includes('LOGIN')
                            ? 'sky'
                            : 'brand'
                      }
                    >
                      {log.action}
                    </StatusBadge>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono-plate text-xs whitespace-nowrap">
                    {log.entity_type}
                    {log.entity_id ? ` #${log.entity_id}` : ''}
                  </td>
                  <td className="px-3.5 py-2.5 max-w-xs truncate font-mono-plate text-[11px] text-slate-500">
                    {log.details_json || '{}'}
                  </td>
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Xem chi tiết nhật ký #${log.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLog(log);
                      }}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-600 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {query.data && (
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.total_pages}
          total={query.data.total}
          pageSize={query.data.page_size}
          onPageChange={setPage}
        />
      )}

      <AuditLogDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
