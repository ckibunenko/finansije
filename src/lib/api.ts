import { useCallback, useEffect, useRef, useState } from 'react';
import type { BudgetState } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000) });
  } catch {
    throw new ApiError(0, method === 'GET' ? 'Nema veze sa serverom. Pokušajte ponovo.' : 'Nema potvrde sa servera. Unos je zadržan; ponovite isti pokušaj da proverite čuvanje.');
  }
  let result;
  try { result = await response.json(); } catch { throw new ApiError(response.status, 'Server nije vratio ispravan odgovor. Pokušajte ponovo.'); }
  if (!response.ok) throw new ApiError(response.status, result.error ?? 'Zahtev nije uspeo.');
  return result as T;
}

export function useBudget() {
  const [data, setData] = useState<BudgetState | null>(null);
  const [auth, setAuth] = useState<'loading' | 'required' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const writeLock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const snapshot = useRef<BudgetState | null>(null);

  const reload = useCallback(async () => {
    const current = ++generation.current;
    try {
      const previous = snapshot.current;
      const response = await api<BudgetState | { unchanged: true; today: string }>('/api/state' + (previous ? `?since=${previous.revision}` : ''));
      if (!mounted.current || current !== generation.current) return;
      const next = 'unchanged' in response ? { ...previous!, today: response.today } : response;
      snapshot.current = next;
      setData(next); setAuth('ready'); setLastSynced(new Date());
    } catch (error) {
      if (!mounted.current || current !== generation.current) return;
      if (error instanceof ApiError && error.status === 401) { snapshot.current = null; setAuth('required'); setData(null); }
      else { setMessage((error as Error).message); setFailed(true); }
      throw error;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload().catch(() => {});
    const refresh = () => { if (document.visibilityState === 'visible' && !writeLock.current) void reload().catch(() => {}); };
    const interval = window.setInterval(refresh, 20000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { mounted.current = false; ++generation.current; clearInterval(interval); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [reload]);

  const mutate = useCallback(async (path: string, method: string, payload: unknown, success: string) => {
    if (writeLock.current) return false;
    writeLock.current = true; ++generation.current; setBusy(true); setFailed(false); setMessage('Čuvanje…');
    try {
      const result = await api<{ deleted?: boolean }>(path, method, payload);
      if (result.deleted) throw new ApiError(409, 'Ovaj unos je ranije sačuvan, pa obrisan. Proverite pregled pre dodavanja nove kupovine.');
      try { await reload(); setFailed(false); setMessage(success); }
      catch { setFailed(true); setMessage(`${success} Pregled nije osvežen; kliknite Osveži.`); }
      return true;
    } catch (error) {
      setMessage((error as Error).message); setFailed(true);
      if (error instanceof ApiError && error.status === 401) { snapshot.current = null; setAuth('required'); setData(null); }
      if (error instanceof ApiError && error.status === 409) await reload().catch(() => {});
      return false;
    } finally { writeLock.current = false; setBusy(false); }
  }, [reload]);

  const signOut = async () => {
    if (writeLock.current) return;
    try {
      await api('/api/logout', 'POST', {}); ++generation.current; snapshot.current = null; setData(null); setAuth('required'); setMessage('');
    } catch (error) { setFailed(true); setMessage((error as Error).message); }
  };
  return { data, auth, busy, message, failed, lastSynced, reload, mutate, signOut };
}
export type Mutate = ReturnType<typeof useBudget>['mutate'];
