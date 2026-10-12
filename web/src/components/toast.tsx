import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ApiError } from '../lib/api';

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}

const Ctx = createContext<{ ok: (m: string) => void; error: (e: unknown) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);
  const ok = useCallback((m: string) => push(m, 'ok'), [push]);
  const error = useCallback((e: unknown) => push(e instanceof ApiError || e instanceof Error ? e.message : String(e), 'error'), [push]);
  return (
    <Ctx.Provider value={{ ok, error }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
            {t.tone === 'error' ? <XCircle /> : <CheckCircle2 />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}
