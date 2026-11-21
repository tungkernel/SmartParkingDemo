import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  TOKEN_KEY,
  apiRequest,
  clearAuthSession,
  getStoredRefreshToken,
  getStoredToken,
  getStoredUser,
  setAuthSession,
} from '../lib/api';
import type { AuthUser, TokenResponse } from '../types';
import { useToast } from './ToastContext';

interface AuthContextValue {
  user: AuthUser | null;
  bootstrapping: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [user, setUser] = useState<AuthUser | null>(() =>
    getStoredToken() ? getStoredUser() : null,
  );
  const [bootstrapping, setBootstrapping] = useState<boolean>(() => Boolean(getStoredToken()));

  const refreshProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setBootstrapping(false);
      return;
    }
    try {
      const fresh = await apiRequest<AuthUser>('/api/v1/auth/me');
      setAuthSession(getStoredToken() ?? token, fresh, getStoredRefreshToken());
      setUser(fresh);
    } catch {
      clearAuthSession();
      setUser(null);
    } finally {
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return undefined;
    let cancelled = false;
    void apiRequest<AuthUser>('/api/v1/auth/me')
      .then((fresh) => {
        if (cancelled) return;
        setAuthSession(getStoredToken() ?? token, fresh, getStoredRefreshToken());
        setUser(fresh);
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthSession();
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      queryClient.clear();
      notify('err', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY && !event.newValue) {
        setUser(null);
        queryClient.clear();
      }
    };
    window.addEventListener('auth-expired', handleExpired);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('auth-expired', handleExpired);
      window.removeEventListener('storage', handleStorage);
    };
  }, [notify, queryClient]);

  const login = useCallback(
    async (username: string, password: string): Promise<AuthUser> => {
      const data = await apiRequest<TokenResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setAuthSession(data.access_token, data.user, data.refresh_token);
      queryClient.clear();
      setUser(data.user);
      return data.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = getStoredRefreshToken();
    try {
      if (getStoredToken()) {
        await apiRequest('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } catch {
      // Ignore network/401 errors during local logout cleanup
    } finally {
      clearAuthSession();
      queryClient.clear();
      setUser(null);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, bootstrapping, login, logout, refreshProfile }),
    [user, bootstrapping, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
