export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getErrorMessage(err: unknown, fallback = 'Đã xảy ra lỗi không xác định.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

interface ErrorBody {
  detail?: string;
  message?: string;
  code?: string;
}

function buildUrl(path: string): string {
  const normalized = path.startsWith('/api/v1')
    ? path
    : path.startsWith('/api/')
      ? path.replace('/api/', '/api/v1/')
      : path;
  return `${API_BASE}${normalized}`;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const combinedSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(buildUrl(path), { ...options, headers, signal: combinedSignal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(0, 'Không thể kết nối tới máy chủ API. Kiểm tra mạng hoặc backend.');
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errBody = (data && typeof data === 'object' ? data : {}) as ErrorBody;
    const msg = errBody.detail || errBody.message || `Lỗi máy chủ (${res.status})`;
    throw new ApiError(res.status, msg, errBody.code);
  }
  return data as T;
}

export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(buildUrl(path), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `Không thể tải tệp xuất báo cáo (${res.status}).`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackFilename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatVnd(amount: number | null | undefined): string {
  const num = Number(amount ?? 0);
  return `${num.toLocaleString('vi-VN')} đ`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  let normalized = value.includes('T') ? value : value.replace(' ', 'T');
  // Backend stores UTC timestamps; append Z when no timezone offset is present
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized += 'Z';
  }
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
