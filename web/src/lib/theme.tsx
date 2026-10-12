import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { patch } from './api';
import { useAuth } from './auth';
import { usePublicInfo } from './queries';

export type ThemeName = 'academy' | 'falcon' | 'neutral';
export type Mode = 'light' | 'dark' | 'system';

export const THEMES: { id: ThemeName; label: string; description: string; swatch: [string, string] }[] = [
  { id: 'academy', label: 'Academy', description: 'Academy blue and silver', swatch: ['#0b2a5b', '#b9c2cf'] },
  { id: 'falcon', label: 'Falcon', description: 'Deep navy with brass', swatch: ['#14213d', '#c9a44a'] },
  { id: 'neutral', label: 'Neutral', description: 'Graphite and teal, no military styling', swatch: ['#1d2022', '#4fb3ab'] },
];

interface ThemeState {
  theme: ThemeName;
  mode: Mode;
  resolvedMode: 'light' | 'dark';
  locked: boolean;
  setTheme: (t: ThemeName) => void;
  setMode: (m: Mode) => void;
}

const Ctx = createContext<ThemeState | null>(null);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

const isTheme = (t: unknown): t is ThemeName => t === 'academy' || t === 'falcon' || t === 'neutral';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: info } = usePublicInfo();
  const { user } = useAuth();
  const orgTheme = (isTheme(info?.appearance.theme) ? info?.appearance.theme : 'academy') as ThemeName;
  const locked = info ? !info.appearance.allowUserTheme : false;
  const [choice, setChoice] = useState<ThemeName | null>(() => (isTheme(read('cds-theme-choice')) ? (read('cds-theme-choice') as ThemeName) : null));
  const [mode, setModeState] = useState<Mode>(() => (read('cds-mode') as Mode) || 'system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Adopt the signed-in user's saved preference.
  useEffect(() => {
    if (!user?.theme) return;
    const [t, m] = user.theme.split('|');
    if (isTheme(t)) {
      setChoice(t);
      write('cds-theme-choice', t);
    }
    if (m === 'light' || m === 'dark' || m === 'system') {
      setModeState(m);
      write('cds-mode', m);
    }
  }, [user?.id, user?.theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const theme = locked || !choice ? orgTheme : choice;
  const resolvedMode = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-theme', theme);
    el.setAttribute('data-mode', resolvedMode);
    write('cds-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    const nav = getComputedStyle(el).getPropertyValue('--nav-bg').trim();
    if (meta && nav) meta.setAttribute('content', nav);
  }, [theme, resolvedMode]);

  const persist = useCallback(
    (t: ThemeName | null, m: Mode) => {
      if (user) void patch('/me', { theme: `${t ?? ''}|${m}` }).catch(() => {});
    },
    [user],
  );

  const setTheme = useCallback(
    (t: ThemeName) => {
      setChoice(t);
      write('cds-theme-choice', t);
      persist(t, mode);
    },
    [mode, persist],
  );
  const setMode = useCallback(
    (m: Mode) => {
      setModeState(m);
      write('cds-mode', m);
      persist(choice, m);
    },
    [choice, persist],
  );

  const value = useMemo(() => ({ theme, mode, resolvedMode, locked, setTheme, setMode }), [theme, mode, resolvedMode, locked, setTheme, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
