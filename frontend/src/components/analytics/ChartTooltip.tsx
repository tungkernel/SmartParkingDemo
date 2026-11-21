import { ACCENT_OPTIONS, useTheme } from '../../context/ThemeContext';
import { formatVnd } from '../../lib/api';

interface TooltipPayloadItem {
  name?: string;
  dataKey?: string;
  value?: number | string;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  valueKind?: 'mixed' | 'currency';
}

export function ChartTooltip({ active, label, payload, valueKind = 'mixed' }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200/90 dark:border-slate-700/90 bg-surface/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2.5 shadow-xl text-xs">
      {label && (
        <div className="mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 font-mono-plate font-bold text-slate-800 dark:text-slate-100">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const num = Number(entry.value ?? 0);
          const isRevenue =
            valueKind === 'currency' || entry.dataKey === 'doanh_thu' || entry.name === 'doanh_thu';
          const displayName =
            entry.dataKey === 'doanh_thu'
              ? 'Doanh thu'
              : entry.dataKey === 'so_luot'
                ? 'Số giao dịch'
                : (entry.name ?? 'Giá trị');
          return (
            <div key={idx} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color || '#2563EB' }}
                />
                {displayName}
              </span>
              <span className="font-mono-plate font-bold text-slate-900 dark:text-slate-100">
                {isRevenue ? formatVnd(num) : `${num.toLocaleString('vi-VN')} lượt`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function useChartPalette() {
  const { theme, accent } = useTheme();
  const accentColor = ACCENT_OPTIONS.find((a) => a.id === accent)?.swatch ?? '#1D56D8';
  const isDark = theme === 'dark';

  return {
    primary: accentColor,
    secondary: isDark ? '#34d399' : '#047857',
    tertiary: isDark ? '#38bdf8' : '#0369a1',
    grid: isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(107, 101, 91, 0.22)',
    axisText: isDark ? '#94a3b8' : '#5c564d',
    cursorFill: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(31, 29, 26, 0.05)',
  };
}
