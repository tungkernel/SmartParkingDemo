/** Parse UTC timestamp returned by FastAPI backend into a JS Date. */
export function parseUtcDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  let normalized = value.includes('T') ? value : value.replace(' ', 'T');
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized += 'Z';
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Return elapsed hours (float, >= 0) from a UTC check-in timestamp to `nowMs`. */
export function getHoursParked(checkinTime: string | null | undefined, nowMs = Date.now()): number {
  const d = parseUtcDate(checkinTime);
  if (!d) return 0;
  return Math.max(0, (nowMs - d.getTime()) / 3_600_000);
}

/** Format elapsed duration compactly in Vietnamese, e.g. "< 1p", "42p", "3g 15p", "2n 4g". */
export function formatElapsedDuration(
  checkinTime: string | null | undefined,
  nowMs = Date.now(),
): string {
  const d = parseUtcDate(checkinTime);
  if (!d) return '—';
  const totalMinutes = Math.max(0, Math.floor((nowMs - d.getTime()) / 60_000));
  if (totalMinutes < 1) return '< 1p';
  if (totalMinutes < 60) return `${totalMinutes}p`;
  const totalHours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (totalHours < 24) {
    return mins > 0 ? `${totalHours}g ${mins}p` : `${totalHours}g`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}n ${remHours}g` : `${days}n`;
}

/** Days remaining until an ISO YYYY-MM-DD end date in Vietnam timezone (UTC+7). */
export function getDaysRemaining(
  endDateIso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!endDateIso) return null;
  const end = new Date(endDateIso.length === 10 ? `${endDateIso}T23:59:59+07:00` : endDateIso);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - nowMs) / 86_400_000);
}

/** Compute percentage of monthly pass validity elapsed (0..100). */
export function getPassProgressPct(
  startDateIso: string | null | undefined,
  endDateIso: string | null | undefined,
  nowMs = Date.now(),
): number {
  if (!startDateIso || !endDateIso) return 0;
  const start = new Date(
    startDateIso.length === 10 ? `${startDateIso}T00:00:00+07:00` : startDateIso,
  );
  const end = new Date(endDateIso.length === 10 ? `${endDateIso}T23:59:59+07:00` : endDateIso);
  const total = end.getTime() - start.getTime();
  if (Number.isNaN(total) || total <= 0) return 100;
  const elapsed = nowMs - start.getTime();
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

/** Current Vietnam local clock string (HH:mm:ss) and short date. */
export function formatVietnamClock(now: Date): { time: string; date: string } {
  const time = now.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const date = now.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  return { time, date };
}

/** Return YYYY-MM-DD in Asia/Ho_Chi_Minh timezone shifted by `offsetDays`. */
export function getVnDateIso(offsetDays = 0, baseDate = new Date()): string {
  const shifted = new Date(baseDate.getTime() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}
