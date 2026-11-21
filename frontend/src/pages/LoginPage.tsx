import { CarFront, Lock, ShieldCheck, User } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/api';

const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const { login } = useAuth();
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-slate-200/20">
        <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-indigo-600 to-blue-700 p-10 text-white">
          <div>
            <div className="inline-flex items-center gap-2.5 rounded-2xl bg-white/15 px-3.5 py-2 backdrop-blur-xs">
              <CarFront className="h-5 w-5" />
              <span className="text-sm font-bold tracking-wide">SMART PARKING PTIT</span>
            </div>
            <h1 className="mt-8 text-3xl font-extrabold leading-tight">
              Hệ thống Vận hành Bãi đỗ xe Thông minh
            </h1>
            <p className="mt-4 text-sm text-indigo-100 leading-relaxed">
              Kiểm soát cổng vào/ra theo thời gian thực, thanh toán VietQR chuẩn EMVCo, đối soát ca
              trực thu ngân, phân quyền RBAC và nhật ký kiểm toán trên TiDB Cloud.
            </p>
          </div>

          <div className="space-y-2.5 text-xs text-indigo-100/90">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span>Phân quyền ADMIN / ACCOUNTANT / OPERATOR kèm Refresh Token</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span>Đồng bộ trạng thái ô đỗ tức thời qua WebSocket bảo mật</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span>In phiếu gửi xe & biên lai nhiệt 80mm kèm mã QR</span>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-10 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold mb-6">
            <CarFront className="h-6 w-6" />
            <span>SMART PARKING PTIT</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Đăng nhập hệ thống
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Sử dụng tài khoản nhân viên được cấp để vận hành bãi xe.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor={userId}
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
              >
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id={userId}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Ví dụ: admin, thungan, baove"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={passId}
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5"
              >
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id={passId}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 shadow-sm transition cursor-pointer"
            >
              {loading ? 'Đang xác thực...' : 'Đăng nhập vào quầy vận hành'}
            </button>
          </form>

          {IS_DEV && (
            <div className="mt-6 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Tài khoản thử nghiệm (chỉ hiển thị ở chế độ phát triển):
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { u: 'admin', label: 'Quản lý' },
                  { u: 'thungan', label: 'Thu ngân' },
                  { u: 'baove', label: 'Bảo vệ' },
                ].map((acc) => (
                  <button
                    key={acc.u}
                    type="button"
                    onClick={() => {
                      setUsername(acc.u);
                      setPassword('123456');
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-left hover:border-indigo-400"
                  >
                    <div className="font-mono-plate font-bold text-slate-800 dark:text-slate-100">
                      {acc.u}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{acc.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
