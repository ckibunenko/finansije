import { useEffect, useRef, useState } from 'react';
import { isRecord, parseImportedBudgetMap } from '../../shared/budget';
import type { Mutate } from '../lib/api';

export function inspectImport(input: unknown) {
  const map = parseImportedBudgetMap(isRecord(input) && input.format === 'finansije-v2' ? input.budgetMap : input);
  const months = Object.values(map);
  return { months: months.length, days: months.reduce((n, m) => n + m.entries.filter((e) => e.amount !== null).length, 0),
    total: months.reduce((sum, m) => sum + m.entries.reduce((s, e) => s + (e.amount ?? 0), 0), 0) };
}
export default function ImportPreview({ input, onClose, mutate, busy, error }: { input: unknown; onClose: () => void; mutate: Mutate; busy: boolean; error?: string }) {
  const info = inspectImport(input);
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }} className="w-[calc(100%-2rem)] max-w-lg rounded-[28px] border-0 bg-white p-7 shadow-xl backdrop:bg-slate-950/50 dark:bg-slate-900 dark:text-white">
    <h2 className="text-2xl font-semibold">Prenesi postojeću evidenciju</h2>
    <p className="mt-4 text-sm leading-6">Kopija sadrži {info.months} meseci, {info.days} unetih dana i ukupno {info.total.toLocaleString('sr-Latn-RS')} dinara.</p>
    <p className="mt-3 text-sm leading-6 text-slate-500">Uvoz radi samo kada je zajednička baza prazna. Originalna kopija i stari podaci u browseru ostaju sačuvani.</p>
    <label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />Želim da prenesem ove podatke u našu zajedničku evidenciju.</label>
    <div className="mt-6 flex flex-wrap gap-3"><button className="primary" disabled={busy || !confirmed} onClick={async () => { if (await mutate('/api/import', 'POST', input, 'Evidencija je preneta u zajedničku bazu.')) onClose(); }}>{busy ? 'Prenošenje…' : 'Potvrdi uvoz'}</button><button className="secondary" disabled={busy} onClick={onClose}>Odustani</button></div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
  </dialog>;
}
