import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { apiRequest, getErrorMessage } from '../../lib/api';
import type { ParkingLot, ZoneSummary } from '../../types';

export function InfrastructureTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const prefix = useId();

  const [lotName, setLotName] = useState('');
  const [lotLoc, setLotLoc] = useState('');
  const [zoneLotId, setZoneLotId] = useState<number | ''>('');
  const [zoneName, setZoneName] = useState('');

  const lotsQuery = useQuery<ParkingLot[]>({
    queryKey: ['lots'],
    queryFn: ({ signal }) => apiRequest<ParkingLot[]>('/api/v1/lots', { signal }),
  });

  const zonesQuery = useQuery<ZoneSummary[]>({
    queryKey: ['zones'],
    queryFn: ({ signal }) => apiRequest<ZoneSummary[]>('/api/v1/zones', { signal }),
  });

  const createLotMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/lots', {
        method: 'POST',
        body: JSON.stringify({ name: lotName, location: lotLoc }),
      }),
    onSuccess: () => {
      notify('ok', `Đã thêm bãi đỗ "${lotName}".`);
      setLotName('');
      setLotLoc('');
      void queryClient.invalidateQueries({ queryKey: ['lots'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const createZoneMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/zones', {
        method: 'POST',
        body: JSON.stringify({ lot_id: Number(effectiveLotId), name: zoneName }),
      }),
    onSuccess: () => {
      notify('ok', `Đã thêm khu vực "${zoneName}".`);
      setZoneName('');
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const lots = lotsQuery.data ?? [];
  const effectiveLotId = zoneLotId || lots[0]?.id || '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Building2 className="h-4 w-4 text-indigo-600" />
          Bãi đỗ xe ({lots.length})
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createLotMutation.mutate();
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end text-xs"
        >
          <div>
            <label htmlFor={`${prefix}-ln`} className="block font-semibold mb-1">Tên bãi đỗ</label>
            <input
              id={`${prefix}-ln`}
              required
              maxLength={100}
              value={lotName}
              onChange={(e) => setLotName(e.target.value)}
              placeholder="Bãi D - Giảng đường"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor={`${prefix}-ll`} className="block font-semibold mb-1">Địa điểm</label>
            <input
              id={`${prefix}-ll`}
              required
              maxLength={255}
              value={lotLoc}
              onChange={(e) => setLotLoc(e.target.value)}
              placeholder="Km10 Nguyễn Trãi"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={createLotMutation.isPending}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm bãi
          </button>
        </form>
        <div className="space-y-2 text-xs">
          {lots.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 p-3"
            >
              <div>
                <div className="font-bold">{l.tenbaido}</div>
                <div className="text-[11px] text-slate-500">{l.diadiem}</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{l.tong_cho} ô</div>
                <div className="text-[11px] text-emerald-600">{l.cho_trong} trống</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="text-sm font-bold">Khu vực đỗ ({zonesQuery.data?.length ?? 0})</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (effectiveLotId) createZoneMutation.mutate();
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end text-xs"
        >
          <div>
            <label htmlFor={`${prefix}-zl`} className="block font-semibold mb-1">Thuộc bãi đỗ</label>
            <select
              id={`${prefix}-zl`}
              value={effectiveLotId}
              onChange={(e) => setZoneLotId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            >
              {lots.map((l) => (
                <option key={l.id} value={l.id}>{l.tenbaido}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${prefix}-zn`} className="block font-semibold mb-1">Tên khu vực</label>
            <input
              id={`${prefix}-zn`}
              required
              maxLength={20}
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="VD: KHU-C1"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={createZoneMutation.isPending || !effectiveLotId}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm khu
          </button>
        </form>
        <div className="space-y-2 text-xs max-h-80 overflow-y-auto">
          {(zonesQuery.data ?? []).map((z) => (
            <div
              key={z.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 p-3"
            >
              <div>
                <div className="font-bold">Khu {z.ten}</div>
                <div className="text-[11px] text-slate-500">{z.tenbaido}</div>
              </div>
              <div className="text-right">
                <span className="font-bold">{z.cho_trong}</span> / {z.tong_cho} trống
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
