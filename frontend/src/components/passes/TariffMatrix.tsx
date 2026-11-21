import { Edit3, Tag, Trash2 } from 'lucide-react';
import { formatVnd } from '../../lib/api';
import type { Tariff } from '../../types';
import { EmptyState } from '../ui/EmptyState';
import { StatusBadge } from '../ui/StatusBadge';
import { VehicleIcon } from '../ui/VehicleIcon';

interface TariffMatrixProps {
  tariffs: Tariff[];
  canManage: boolean;
  canDelete?: boolean;
  onEditTariff: (tariff: Tariff) => void;
  onDeleteTariff?: (tariff: Tariff) => void;
}

export function TariffMatrix({
  tariffs,
  canManage,
  canDelete = false,
  onEditTariff,
  onDeleteTariff,
}: TariffMatrixProps) {
  const dailyTariffs = tariffs.filter((t) => t.loaive !== 'tháng');
  const monthlyTariffs = tariffs.filter((t) => t.loaive === 'tháng');

  if (tariffs.length === 0) {
    return (
      <div className="card-surface rounded-2xl">
        <EmptyState
          icon={<Tag className="h-5 w-5" />}
          title="Chưa có biểu giá nào"
          description="Biểu giá gửi xe ngày và vé tháng sẽ hiển thị tại đây."
        />
      </div>
    );
  }

  const renderGroup = (
    title: string,
    subtitle: string,
    badgeTone: 'amber' | 'violet',
    items: Tariff[],
  ) => (
    <section className="card-surface rounded-2xl overflow-hidden flex flex-col min-h-[260px] max-h-[65vh] lg:max-h-full">
      <div className="shrink-0 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        <StatusBadge tone={badgeTone} dot>
          {items.length} mức giá
        </StatusBadge>
      </div>
      <div className="flex-1 min-h-0 scroll-pane">
        <table className="w-full text-left text-[13px]">
          <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3.5 py-2.5 whitespace-nowrap">Mã</th>
              <th className="px-3.5 py-2.5 whitespace-nowrap">Loại phương tiện</th>
              <th className="px-3.5 py-2.5 whitespace-nowrap">Đối tượng khách hàng</th>
              <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Đơn giá</th>
              {(canManage || canDelete) && (
                <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Điều chỉnh</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {items.map((t) => (
              <tr
                key={t.id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td className="px-3.5 py-2.5 font-mono-plate text-xs text-slate-500 whitespace-nowrap">
                  #{t.id}
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2 font-semibold capitalize text-slate-900 dark:text-slate-100">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <VehicleIcon vehicleType={t.loaiphuongtien} className="h-4 w-4" />
                    </span>
                    {t.loaiphuongtien}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-300">
                  {t.loaikhachhang}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono-plate font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {formatVnd(t.dongia)}
                  <span className="text-[11px] font-normal text-slate-400">
                    /{t.loaive === 'tháng' ? 'tháng' : 'lượt'}
                  </span>
                </td>
                {(canManage || canDelete) && (
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => onEditTariff(t)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Sửa giá
                        </button>
                      )}
                      {canDelete && onDeleteTariff && (
                        <button
                          type="button"
                          aria-label={`Xóa biểu giá #${t.id}`}
                          onClick={() => onDeleteTariff(t)}
                          className="rounded-xl border border-rose-200 dark:border-rose-900/80 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-1 gap-4 items-stretch">
      {renderGroup(
        'Biểu giá Vé ngày (Vãng lai)',
        'Áp dụng tự động khi tính phí Check-out theo lượt đỗ',
        'amber',
        dailyTariffs,
      )}
      {renderGroup(
        'Biểu giá Vé tháng (Định kỳ)',
        'Áp dụng khi đăng ký mới hoặc gia hạn vé tháng',
        'violet',
        monthlyTariffs,
      )}
    </div>
  );
}
