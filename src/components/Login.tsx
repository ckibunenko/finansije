import { useState } from 'react';
import { api } from '../lib/api';

export default function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="grid min-h-screen place-items-center bg-halo p-5 dark:bg-slate-950">
    <main className="w-full max-w-md rounded-[28px] border border-white bg-white p-8 shadow-soft dark:border-slate-700 dark:bg-slate-900 dark:text-white">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700 dark:text-sky-300">Naše finansije</p>
      <h1 className="mt-4 text-3xl font-semibold">Sve na jednom mestu.</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Prijavite se za zajednički pregled troškova, budžeta i štednje.</p>
      <form className="mt-6 space-y-4" onSubmit={async (event) => {
        event.preventDefault(); if (busy) return; setBusy(true); setError('');
        try { await api('/api/login', 'POST', { password }); setPassword(''); await onLogin(); }
        catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <label className="block text-sm font-medium">Zajednička šifra<input className="field mt-2" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
        <button disabled={busy} className="primary w-full">{busy ? 'Prijavljivanje…' : 'Otvori finansije'}</button>
      </form>
      <p className="mt-5 text-xs leading-5 text-slate-500">Prijava ostaje zapamćena 30 dana na ovom uređaju.</p>
      <a href="/privacy" className="mt-4 inline-block text-xs text-brand-700 dark:text-sky-300">Privatnost</a>
    </main>
  </div>;
}
