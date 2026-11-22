import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, Car, CreditCard, Flame, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip, useChartPalette } from '../components/analytics/ChartTooltip';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { KpiCard } from '../components/ui/KpiCard';
import { KpiGridSkeleton, Skeleton } from '../components/ui/Skeleton';
import { apiRequest, formatVnd, getErrorMessage } from '../lib/api';
import { cn } from '../lib/cn';
import type { AnalyticsSummary } from '../types';

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const palette = useChartPalette();

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<AnalyticsSummary>({
    queryKey: ['analytics', days],
    queryFn: ({ signal }) =>
      apiRequest<AnalyticsSummary>(`/api/v1/analytics/summary?days=${days}`, { signal }),
    placeholderData: (prev) => prev,
  });

  const daily = useMemo(() => data?.daily ?? [], [data?.daily]);
  const byLot = useMemo(() => data?.by_lot ?? [], [data?.by_lot]);
  const byVehicle = useMemo(() => data?.by_vehicle_type ?? [], [data?.by_vehicle_type]);

  const stats = useMemo(() => {
    const totalRev = daily.reduce((sum, d) => sum + d.doanh_thu, 0);
    const totalTurns = daily.reduce((sum, d) => sum + d.so_luot, 0);
    const avgPerDay = daily.length > 0 ? Math.round(totalRev / daily.length) : 0;
    const avgPerTx = totalTurns > 0 ? Math.round(totalRev / totalTurns) : 0;
    const peakDay = daily.reduce<(typeof daily)[number] | null>(
      (best, cur) => (!best || cur.doanh_thu > best.doanh_thu ? cur : best),
      null,
    );
    const totalLotRev = byLot.reduce((sum, l) => sum + l.doanh_thu, 0);
    return { totalRev, totalTurns, avgPerDay, avgPerTx, peakDay, totalLotRev };
  }, [daily, byLot]);

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={4} />
        <Skeleton className="h-80 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <ErrorState
        title="Không thể tổng hợp báo cáo doanh thu"
        message={getErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Báo cáo Doanh thu & Lưu lượng
          {isFetching && (
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              Đang đồng bộ...
            </span>
          )}
        </h2>
        <div className="card-surface inline-flex rounded-xl p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors',
                days === d
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={`Doanh thu ${days} ngày`}
          value={<span className="text-lg">{formatVnd(stats.totalRev)}</span>}
          sublabel={`${stats.totalTurns.toLocaleString('vi-VN')} giao dịch · TB ${formatVnd(stats.avgPerDay)}/ngày`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="brand"
        />
        <KpiCard
          label="Giá trị TB / giao dịch"
          value={<span className="text-lg">{formatVnd(stats.avgPerTx)}</span>}
          sublabel={
            stats.peakDay
              ? `Cao điểm: ${stats.peakDay.ngay.slice(5)} (${formatVnd(stats.peakDay.doanh_thu)})`
              : 'Chưa có ngày cao điểm'
          }
          icon={<Flame className="h-4 w-4" />}
          tone="amber"
        />
        <KpiCard
          label="Vé tháng hiệu lực"
          value={`${data?.pass_summary.active_passes ?? 0} / ${data?.pass_summary.total_passes ?? 0}`}
          sublabel="Tổng số thẻ vé tháng đã cấp"
          icon={<CreditCard className="h-4 w-4" />}
          tone="violet"
        />
        <KpiCard
          label="Doanh thu vé tháng (tháng này)"
          value={
            <span className="text-lg">{formatVnd(data?.pass_summary.this_month_pass_revenue)}</span>
          }
          sublabel={`Lũy kế vé tháng: ${formatVnd(data?.pass_summary.total_pass_revenue)}`}
          icon={<Wallet className="h-4 w-4" />}
          tone="emerald"
        />
      </div>

      {/* Charts Body */}
      <div className="flex-1 min-h-0 flex flex-col gap-3.5">
        {/* Daily Revenue & Traffic Composed Chart */}
        <section className="card-surface rounded-2xl p-4 flex-1 lg:flex-[1.15] min-h-[230px] flex flex-col">
          <div className="shrink-0 flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <BarChart3 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Doanh thu & Lưu lượng giao dịch theo ngày
            </div>
            <span className="font-mono-plate text-[11px] text-slate-400">
              {daily.length} ngày có dữ liệu
            </span>
          </div>
          {daily.length === 0 ? (
            <EmptyState
              compact
              icon={<BarChart3 className="h-5 w-5" />}
              title={`Chưa có dữ liệu giao dịch trong ${days} ngày qua`}
              description="Thử mở rộng khung thời gian sang 30 hoặc 90 ngày."
            />
          ) : (
            <div className="relative flex-1 min-h-[165px] w-full">
              <div className="absolute inset-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="revBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={palette.primary} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={palette.primary} stopOpacity={0.45} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                    <XAxis
                      dataKey="ngay"
                      tick={{ fontSize: 11, fill: palette.axisText }}
                      axisLine={{ stroke: palette.grid }}
                      tickLine={false}
                      tickFormatter={(v: string) => v.slice(5)}
                      minTickGap={20}
                    />
                    <YAxis
                      yAxisId="rev"
                      tick={{ fontSize: 11, fill: palette.axisText }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : `${Math.round(v / 1000)}k`
                      }
                    />
                    <YAxis
                      yAxisId="cnt"
                      orientation="right"
                      tick={{ fontSize: 11, fill: palette.axisText }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: palette.cursorFill }}
                      content={<ChartTooltip valueKind="mixed" />}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }}
                      formatter={(value: string) =>
                        value === 'doanh_thu' ? 'Doanh thu (VNĐ)' : 'Số giao dịch'
                      }
                    />
                    <Bar
                      yAxisId="rev"
                      dataKey="doanh_thu"
                      fill="url(#revBarGrad)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={36}
                    />
                    <Line
                      yAxisId="cnt"
                      type="monotone"
                      dataKey="so_luot"
                      stroke={palette.secondary}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: palette.secondary, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>

        {/* Breakdown by Vehicle Type & Parking Lot */}
        <div className="flex-1 min-h-[210px] grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-1 gap-3.5 items-stretch">
          <section className="card-surface rounded-2xl p-4 flex flex-col min-h-[210px]">
            <div className="shrink-0 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
              <Car className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Cơ cấu doanh thu theo loại phương tiện
            </div>
            {byVehicle.length === 0 ? (
              <EmptyState
                compact
                icon={<Car className="h-5 w-5" />}
                title="Chưa có dữ liệu theo loại phương tiện"
              />
            ) : (
              <div className="relative flex-1 min-h-[155px] w-full">
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={byVehicle}
                      layout="vertical"
                      margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={palette.grid}
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: palette.axisText }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1_000_000
                            ? `${(v / 1_000_000).toFixed(1)}M`
                            : `${Math.round(v / 1000)}k`
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="loaiphuongtien"
                        tick={{ fontSize: 12, fill: palette.axisText }}
                        axisLine={false}
                        tickLine={false}
                        width={92}
                      />
                      <Tooltip
                        cursor={{ fill: palette.cursorFill }}
                        content={<ChartTooltip valueKind="currency" />}
                      />
                      <Bar
                        dataKey="doanh_thu"
                        fill={palette.tertiary}
                        radius={[0, 8, 8, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          <section className="card-surface rounded-2xl p-4 flex flex-col min-h-[210px] max-h-[45vh] lg:max-h-none overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
              <Building2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Tỷ trọng doanh thu theo bãi đỗ
            </div>
            {byLot.length === 0 ? (
              <EmptyState
                compact
                icon={<Building2 className="h-5 w-5" />}
                title="Chưa có dữ liệu theo bãi đỗ"
              />
            ) : (
              <div className="flex-1 min-h-0 scroll-pane pr-1 space-y-2.5">
                {byLot.map((lot) => {
                  const sharePct =
                    stats.totalLotRev > 0
                      ? Math.round((lot.doanh_thu / stats.totalLotRev) * 100)
                      : 0;
                  return (
                    <div
                      key={`${lot.lot_id ?? lot.tenbaido}`}
                      className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-2.5 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {lot.tenbaido}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {lot.diadiem} · {lot.so_luot.toLocaleString('vi-VN')} giao dịch
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono-plate text-sm font-extrabold text-brand-600 dark:text-brand-400">
                            {formatVnd(lot.doanh_thu)}
                          </div>
                          <div className="font-mono-plate text-[10px] font-semibold text-slate-400">
                            {sharePct}% tổng thu
                          </div>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/70">
                        <div
                          className="h-full rounded-full bg-brand-600 transition-all duration-500"
                          style={{ width: `${sharePct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
