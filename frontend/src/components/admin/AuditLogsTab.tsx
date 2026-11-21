import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiRequest, formatDateTime } from '../../lib/api';
import type { AuditLog, PaginatedResponse } from '../../types';
import { PaginationBar } from '../ui/PaginationBar';
import { StatusBadge } from '../ui/StatusBadge';

export function AuditLogsTab() {
  const [page, setPage] = useState(1);
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

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

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-slate-800 p-4 text-xs">
        <input
          type="text"
          aria-label="Lọc theo tài khoản thao tác"
          value={actorFilter}
          onChange={(e) => {
            setActorFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Lọc tài khoản (admin, baove...)"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 outline-none"
        />
        <input
          type="text"
          aria-label="Lọc theo hành động"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value.toUpperCase());
            setPage(1);
          }}
          placeholder="Mã hành động (CHECK_OUT, LOGIN_SUCCESS...)"
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 outline-none w-64"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Tài khoản / IP</th>
              <th className="px-4 py-3">Hành động</th>
              <th className="px-4 py-3">Đối tượng</th>
              <th className="px-4 py-3">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(query.data?.items ?? []).map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono-plate font-bold">@{log.actor_username}</div>
                  {log.ip_address && (
                    <div className="text-[10px] text-slate-400 font-mono-plate">{log.ip_address}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    tone={
                      log.action.includes('DELETE') || log.action.includes('FAILED') || log.action.includes('CANCEL')
                        ? 'rose'
                        : log.action.includes('LOGIN')
                          ? 'sky'
                          : 'indigo'
                    }
                  >
                    {log.action}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3 font-mono-plate">
                  {log.entity_type}
                  {log.entity_id ? ` #${log.entity_id}` : ''}
                </td>
                <td className="px-4 py-3 max-w-md truncate font-mono-plate text-[11px] text-slate-500">
                  {log.details_json || '{}'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
  );
}
