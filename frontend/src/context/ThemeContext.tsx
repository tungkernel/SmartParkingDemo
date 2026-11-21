import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type AccentTheme = 'cobalt' | 'crimson' | 'emerald' | 'amber';

export interface AccentOption {
  id: AccentTheme;
  label: string;
  swatch: string;
  tagline: string;
}

export const ACCENT_OPTIONS: readonly AccentOption[] = [
  { id: 'cobalt', label: 'Cobalt Ops', swatch: '#1D56D8', tagline: 'Mặc định PTIT Tech' },
  { id: 'crimson', label: 'PTIT Crimson', swatch: '#C81E2B', tagline: 'Dấu ấn Học viện' },
  { id: 'emerald', label: 'Gate Emerald', swatch: '#047857', tagline: 'Vận hành xanh' },
  { id: 'amber', label: 'Signal Amber', swatch: '#B45309', tagline: 'Tương phản cao' },
] as const;

interface ThemeContextValue {
  theme: Theme;
  accent: AccentTheme;
  toggleTheme: () => void;
  setAccent: (next: AccentTheme) => void;
}

const THEME_KEY = 'smart_parking_theme';
const ACCENT_KEY = 'smart_parking_accent';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') return 'dark';
  } catch {
    // ignore storage access errors
  }
  return 'light';
}

function resolveInitialAccent(): AccentTheme {
  try {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (saved === 'cobalt' || saved === 'crimson' || saved === 'emerald' || saved === 'amber') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'cobalt';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);
  const [accent, setAccentState] = useState<AccentTheme>(resolveInitialAccent);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    try {
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      // ignore
    }
  }, [accent]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setAccent = useCallback((next: AccentTheme) => {
    setAccentState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, accent, toggleTheme, setAccent }),
    [theme, accent, toggleTheme, setAccent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
