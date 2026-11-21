import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, Car, CreditCard } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest, formatVnd } from '../lib/api';
import type { AnalyticsSummary } from '../types';

export function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading, isFetching } = useQuery<AnalyticsSummary>({
    queryKey: ['analytics', days],
    queryFn: ({ signal }) =>
      apiRequest<AnalyticsSummary>(`/api/v1/analytics/summary?days=${days}`, { signal }),
    placeholderData: (prev) => prev,
  });

  if (isLoading && !data) {
    return (
      <div className="p-10 text-center text-sm text-slate-400">
        Đang tổng hợp biểu đồ doanh thu...
      </div>
    );
  }

  const daily = data?.daily ?? [];
  const totalPeriodRev = daily.reduce((sum, d) => sum + d.doanh_thu, 0);
  const totalPeriodTurns = daily.reduce((sum, d) => sum + d.so_luot, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Báo cáo Doanh thu & Lưu lượng
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Đã gộp đầy đủ doanh thu lượt đỗ ngày và đăng ký/gia hạn vé tháng theo giờ Việt Nam (UTC+7)
            {isFetching ? ' · Đang cập nhật...' : ''}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                days === d
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Doanh thu {days} ngày gần nhất</div>
          <div className="mt-1.5 text-xl font-extrabold text-indigo-700 dark:text-indigo-300">
            {formatVnd(totalPeriodRev)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{totalPeriodTurns} giao dịch thành công</div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Vé tháng hiệu lực</span>
            <CreditCard className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-1.5 text-xl font-extrabold">
            {data?.pass_summary.active_passes ?? 0} / {data?.pass_summary.total_passes ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Tổng số vé tháng đã cấp</div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Doanh thu vé tháng (tháng này)</div>
          <div className="mt-1.5 text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {formatVnd(data?.pass_summary.this_month_pass_revenue)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Gồm đăng ký mới & gia hạn</div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Tổng doanh thu vé tháng lũy kế</div>
          <div className="mt-1.5 text-xl font-extrabold">
            {formatVnd(data?.pass_summary.total_pass_revenue)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Toàn hệ thống</div>
        </div>
      </div>

      {/* Daily Revenue & Traffic Composed Chart */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-bold mb-4">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          Doanh thu & Lưu lượng giao dịch theo ngày
        </div>
        {daily.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Chưa có dữ liệu giao dịch trong {days} ngày qua.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 10, right: 12, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                <XAxis
                  dataKey="ngay"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  minTickGap={20}
                />
                <YAxis
                  yAxisId="rev"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`
                  }
                />
                <YAxis yAxisId="cnt" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => {
                    const num = Number(value ?? 0);
                    return name === 'doanh_thu'
                      ? [formatVnd(num), 'Doanh thu']
                      : [`${num} lượt`, 'Số giao dịch'];
                  }}
                />
                <Bar yAxisId="rev" dataKey="doanh_thu" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line yAxisId="cnt" type="monotone" dataKey="so_luot" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Breakdown by Vehicle Type & Parking Lot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold mb-4">
            <Car className="h-4 w-4 text-indigo-600" />
            Cơ cấu doanh thu theo loại phương tiện
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data?.by_vehicle_type ?? []}
                layout="vertical"
                margin={{ top: 5, right: 16, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                />
                <YAxis type="category" dataKey="loaiphuongtien" tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={(val: unknown) => [formatVnd(Number(val ?? 0)), 'Doanh thu']} />
                <Bar dataKey="doanh_thu" fill="#0ea5e9" radius={[0, 6, 6, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold mb-4">
            <Building2 className="h-4 w-4 text-indigo-600" />
            So sánh doanh thu theo bãi đỗ
          </div>
          <div className="space-y-3">
            {(data?.by_lot ?? []).map((lot) => (
              <div
                key={`${lot.lot_id ?? lot.tenbaido}`}
                className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 px-4 py-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">{lot.tenbaido}</div>
                  <div className="text-[11px] text-slate-500">
                    {lot.diadiem} · {lot.so_luot} giao dịch
                  </div>
                </div>
                <div className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300">
                  {formatVnd(lot.doanh_thu)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
