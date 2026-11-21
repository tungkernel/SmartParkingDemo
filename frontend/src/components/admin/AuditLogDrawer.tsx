import { Check, Copy, History } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime } from '../../lib/api';
import type { AuditLog } from '../../types';
import { Drawer } from '../ui/Drawer';
import { StatusBadge } from '../ui/StatusBadge';

interface AuditLogDrawerProps {
  log: AuditLog | null;
  onClose: () => void;
}

function parseDetails(raw: string | null): { entries: Array<[string, string]>; pretty: string } {
  if (!raw) return { entries: [], pretty: '{}' };
  try {
    const parsed: unknown = JSON.parse(raw);
    const pretty = JSON.stringify(parsed, null, 2);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
        k,
        typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? 'null'),
      ]) as Array<[string, string]>;
      return { entries, pretty };
    }
    return { entries: [], pretty };
  } catch {
    return { entries: [], pretty: raw };
  }
}

export function AuditLogDrawer({ log, onClose }: AuditLogDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const { entries, pretty } = parseDetails(log.details_json);
  const actionTone =
    log.action.includes('DELETE') || log.action.includes('FAILED') || log.action.includes('CANCEL')
      ? 'rose'
      : log.action.includes('LOGIN')
        ? 'sky'
        : 'brand';

  const copyJson = () => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(pretty).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Drawer
      open={Boolean(log)}
      onClose={onClose}
      title={`Chi tiết nhật ký #${log.id}`}
      subtitle={formatDateTime(log.created_at)}
      titleIcon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
          <History className="h-4 w-4" />
        </span>
      }
    >
      <div className="p-5 space-y-5 text-xs">
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Hành động</span>
            <StatusBadge tone={actionTone}>{log.action}</StatusBadge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Tài khoản thực hiện</span>
            <span className="font-mono-plate font-bold text-slate-900 dark:text-slate-100">
              @{log.actor_username}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Địa chỉ IP</span>
            <span className="font-mono-plate text-slate-700 dark:text-slate-200">
              {log.ip_address || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Đối tượng</span>
            <span className="font-mono-plate font-semibold text-slate-800 dark:text-slate-100">
              {log.entity_type}
              {log.entity_id ? ` #${log.entity_id}` : ''}
            </span>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px]">
              Thuộc tính chi tiết
            </h4>
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {entries.map(([key, val]) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 px-3.5 py-2.5 bg-surface dark:bg-slate-900"
                >
                  <span className="font-mono-plate text-slate-500 dark:text-slate-400 shrink-0">
                    {key}
                  </span>
                  <span className="font-mono-plate font-semibold text-slate-900 dark:text-slate-100 text-right break-all">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px]">
              Raw JSON Payload
            </h4>
            <button
              type="button"
              onClick={copyJson}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-brand-400"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
          <pre className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-950 text-slate-200 p-4 font-mono-plate text-[11px] overflow-x-auto leading-relaxed">
            {pretty}
          </pre>
        </div>
      </div>
    </Drawer>
  );
}
