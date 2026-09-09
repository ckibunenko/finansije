import { useState } from 'react';
import { api } from '../lib/api';

const SHORTCUT_STEPS = 'Prečice → + → „Ask for Input" (broj) → „Get Contents of URL" (POST). Ceo recept je u SHORTCUT.md.';

export default function Shortcut({ devices, busy, onChanged }: { devices: number; busy: boolean; onChanged: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError('');
    try { await action(); onChanged(); }
    catch (problem) { setError((problem as Error).message); }
    finally { setWorking(false); }
  };

  const create = () => run(async () => {
    const result = await api<{ token: string }>('/api/devices', 'POST', { label: 'Telefon' });
    setToken(result.token); setCopied(false);
  });

  const revoke = () => run(async () => {
    await api('/api/devices', 'DELETE', {});
    setToken(null); setConfirmRevoke(false);
  });

  const copy = async () => {
    if (!token) return;
    try { await navigator.clipboard.writeText(token); setCopied(true); }
    catch { setError('Kopiranje nije uspelo. Označite kod i kopirajte ga ručno.'); }
  };

  const disabled = busy || working;
  return (
    <section className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700 dark:bg-slate-900/80">
      <h2 className="text-xl font-semibold dark:text-white">Prečica na telefonu</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Unos kupovine jednim tapom ili glasom, bez otvaranja aplikacije i bez prijave. Prečica sme samo
        da doda kupovinu i pročita mesečni pregled — ne može da menja plan, briše unose ni izveze podatke.
      </p>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {devices === 0 ? 'Nijedna prečica nije povezana.' : `Povezanih prečica: ${devices}.`} {SHORTCUT_STEPS}
      </p>

      {token && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Prepišite ovaj kod u prečicu sada — više se neće prikazati.
          </p>
          <input
            readOnly
            value={token}
            onFocus={(event) => event.currentTarget.select()}
            className="field mt-2 break-all font-mono text-xs"
          />
          <button className="secondary mt-2" onClick={copy}>{copied ? 'Kopirano' : 'Kopiraj kod'}</button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="secondary" disabled={disabled} onClick={create}>Napravi prečicu</button>
        {devices > 0 && (confirmRevoke
          ? <>
              <button className="secondary" disabled={disabled} onClick={revoke}>Potvrdi opoziv prečica</button>
              <button className="secondary" onClick={() => setConfirmRevoke(false)}>Odustani</button>
            </>
          : <button className="secondary" onClick={() => setConfirmRevoke(true)}>Opozovi prečice</button>)}
      </div>
    </section>
  );
}
