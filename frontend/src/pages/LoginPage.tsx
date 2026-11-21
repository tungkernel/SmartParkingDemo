import {
  ArrowRight,
  Check,
  Lock,
  Moon,
  Printer,
  QrCode,
  Radio,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/ui/BrandMark';
import { Button } from '../components/ui/Button';
import { LicensePlate } from '../components/ui/LicensePlate';
import { PasswordInput } from '../components/ui/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { ACCENT_OPTIONS, useTheme } from '../context/ThemeContext';
import { getErrorMessage } from '../lib/api';
import { cn } from '../lib/cn';

const IS_DEV = import.meta.env.DEV;

const PREVIEW_SLOTS = [
  { code: 'A1', state: 'occupied' as const, plate: '29A-881.24' },
  { code: 'A2', state: 'free' as const, plate: null },
  { code: 'A3', state: 'occupied' as const, plate: '30G-519.02' },
  { code: 'A4', state: 'free' as const, plate: null },
  { code: 'B1', state: 'occupied' as const, plate: '29E1-642.19' },
  { code: 'B2', state: 'free' as const, plate: null },
  { code: 'B3', state: 'maint' as const, plate: null },
  { code: 'B4', state: 'occupied' as const, plate: '30H-204.55' },
];

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const navigate = useNavigate();
  const userId = useId();
  const passId = useId();

  const [username, setUsername] = useState(IS_DEV ? 'admin' : '');
  const [password, setPassword] = useState(IS_DEV ? '123456' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/gate', { replace: true });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Đăng nhập thất bại.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-canvas bg-grid-dots p-4 sm:p-6 relative overflow-hidden">
      {/* Subtle top-right appearance controls */}
      <div className="fixed top-4 right-4 z-20 flex items-center gap-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-surface/90 dark:bg-slate-900/85 backdrop-blur-md px-2.5 py-1.5 shadow-sm">
        <div className="flex items-center gap-1.5 pr-1 border-r border-slate-200 dark:border-slate-700">
          {ACCENT_OPTIONS.map((opt) => {
            const active = accent === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAccent(opt.id)}
                title={opt.label}
                aria-label={`Chọn màu ${opt.label}`}
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full transition-transform hover:scale-110',
                  active && 'ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-900',
                )}
                style={{ backgroundColor: opt.swatch }}
              >
                {active && <Check className="h-2.5 w-2.5 text-white stroke-[3]" />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          className="rounded-lg p-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="w-full max-w-[960px] grid md:grid-cols-12 rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-surface dark:bg-[#0E1525] shadow-2xl overflow-hidden">
        {/* Left: PTIT Telemetry Showcase */}
        <div className="hidden md:flex md:col-span-6 relative flex-col justify-between bg-gradient-to-br from-[#DFD9CE] via-[#ECE7DD] to-[#D8D1C3] text-slate-900 border-r border-slate-200/90 dark:from-[#090F1E] dark:via-[#0B1224] dark:to-[#090F1E] dark:text-white dark:border-slate-800 p-9 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl opacity-15 dark:opacity-35"
            style={{ background: 'var(--brand-600)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-rose-600/15 dark:bg-rose-600/20 blur-3xl"
          />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <BrandMark size="md" />
              <div>
                <div className="text-xs font-extrabold tracking-widest uppercase text-slate-900 dark:text-white">
                  Smart Parking PTIT
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Nhóm 10 · Operations Console</span>
                  <span className="h-1 w-1 rounded-full bg-rose-500" />
                  <span className="font-mono-plate text-slate-700 dark:text-slate-300">v2.1</span>
                </div>
              </div>
            </div>

            <h1 className="mt-8 text-2xl lg:text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white">
              Điều hành bãi xe thông minh theo thời gian thực
            </h1>
            <p className="mt-3 text-[13px] text-slate-600 dark:text-slate-300/90 leading-relaxed">
              Kiểm soát cổng vào/ra tốc độ cao, đối soát quỹ thu ngân, thanh toán VietQR chuẩn EMVCo
              và giám sát sơ đồ từng ô đỗ trên nền tảng TiDB Cloud.
            </p>
          </div>

          {/* Live-style Mini Floorplan Telemetry Preview */}
          <div className="relative z-10 my-7 rounded-2xl border border-slate-300/80 bg-surface/90 shadow-xs dark:border-white/10 dark:bg-white/[0.04] p-4 backdrop-blur-xs">
            <div className="flex items-center justify-between text-[11px] mb-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                </span>
                Sơ đồ trực tuyến · Khu A & B
              </span>
              <LicensePlate plate="29A-881.24" size="xs" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PREVIEW_SLOTS.map((s) => (
                <div
                  key={s.code}
                  className={cn(
                    'rounded-xl border px-2 py-2 text-[10px]',
                    s.state === 'free'
                      ? 'border-emerald-300/90 bg-emerald-50/90 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : s.state === 'maint'
                        ? 'border-amber-300/90 bg-amber-50/90 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                        : 'border-sky-300/90 bg-sky-50/90 text-sky-900 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-200',
                  )}
                >
                  <div className="font-mono-plate font-bold">{s.code}</div>
                  <div className="mt-0.5 truncate opacity-85">
                    {s.state === 'free' ? 'Trống' : s.state === 'maint' ? 'Bảo trì' : s.plate}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-2 text-[11px] text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-surface/80 dark:border-white/10 dark:bg-white/[0.03] px-2.5 py-2">
              <Radio className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>WebSocket</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-surface/80 dark:border-white/10 dark:bg-white/[0.03] px-2.5 py-2">
              <QrCode className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
              <span>VietQR TLV</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-surface/80 dark:border-white/10 dark:bg-white/[0.03] px-2.5 py-2">
              <Printer className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>In nhiệt 80mm</span>
            </div>
          </div>
        </div>

        {/* Right: Clean Authentication Form */}
        <div className="md:col-span-6 p-7 sm:p-10 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2.5 mb-6">
            <BrandMark size="sm" />
            <div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                Smart Parking PTIT
              </div>
              <div className="text-[11px] text-slate-500">Operations Console v2.1</div>
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-brand-soft px-2.5 py-1 text-[11px] font-semibold mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            Xác thực phân quyền RBAC
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Đăng nhập hệ thống
          </h2>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            Sử dụng tài khoản nhân viên được cấp để vận hành quầy cổng và đối soát ca.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/50 px-4 py-3 text-[13px] font-medium text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor={userId}
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id={userId}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Ví dụ: admin, thungan, baove"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={passId}
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Mật khẩu
              </label>
              <PasswordInput
                id={passId}
                leadingIcon={<Lock className="h-4 w-4" />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
              {loading ? 'Đang xác thực...' : 'Đăng nhập vào quầy vận hành'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          {IS_DEV && (
            <div className="mt-6 rounded-2xl bg-slate-50/90 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 p-3.5 text-xs">
              <div className="font-semibold text-slate-600 dark:text-slate-300 mb-2">
                Điền nhanh tài khoản thử nghiệm (Dev):
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { u: 'admin', role: 'ADMIN', label: 'Quản lý' },
                  { u: 'thungan', role: 'ACCOUNTANT', label: 'Thu ngân' },
                  { u: 'baove', role: 'OPERATOR', label: 'Bảo vệ' },
                ].map((acc) => {
                  const selected = username === acc.u;
                  return (
                    <button
                      key={acc.u}
                      type="button"
                      onClick={() => {
                        setUsername(acc.u);
                        setPassword('123456');
                      }}
                      className={cn(
                        'rounded-xl border px-2.5 py-2 text-left transition-all',
                        selected
                          ? 'bg-brand-soft shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-800/80 hover:border-brand-400',
                      )}
                    >
                      <div className="font-mono-plate font-bold text-slate-900 dark:text-slate-100">
                        {acc.u}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {acc.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
