import { useState } from 'react';
import type { Expense } from '../types';
import type { Mutate } from '../lib/api';
import { parseAmount, validDate } from '../../shared/budget';

export default function Purchases({ expenses, date, busy, mutate, formatCurrency }: {
  expenses: Expense[]; date: string; busy: boolean; mutate: Mutate; formatCurrency: (value: number) => string;
}) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const rows = expenses.filter((e) => e.date === date);
  return <section className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700 dark:bg-slate-900/80">
    <h2 className="text-xl font-semibold dark:text-white">Kupovine za {date.split('-').reverse().join('.')}.</h2>
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Svaka kupovina je poseban unos. Zbir se automatski prikazuje u tabeli i grafikonima.</p>
    {!rows.length && <p className="mt-5 text-sm text-slate-500">Nema kupovina za izabrani datum.</p>}
    <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">{rows.map((row) => <li className="py-4" key={row.id}>
      {editing?.id === row.id ? <form className="grid gap-3 sm:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault(); const value = parseAmount(amount);
        if (value === null || !validDate(editDate)) { setError('Proverite iznos i datum.'); return; }
        if (await mutate(`/api/expenses/${row.id}`, 'PATCH', { amount: value, description: note, date: editDate, version: editing.version }, 'Kupovina je izmenjena.')) setEditing(null);
      }}>
        <label className="text-sm dark:text-slate-200">Iznos<input className="field mt-1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} /></label>
        <label className="text-sm dark:text-slate-200">Datum<input className="field mt-1" type="date" min="1900-01-01" max="2200-12-31" value={editDate} onChange={(e) => setEditDate(e.target.value)} disabled={busy} /></label>
        <label className="text-sm dark:text-slate-200">Opis<input className="field mt-1" maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} /></label>
        {editing.version !== row.version && <p className="text-sm text-amber-700 sm:col-span-3">Unos je promenjen. Odustanite pa ponovo otvorite izmenu.</p>}
        {error && <p role="alert" className="text-sm text-rose-600 sm:col-span-3">{error}</p>}
        <div className="flex gap-2 sm:col-span-3"><button className="primary" disabled={busy || editing.version !== row.version}>Sačuvaj izmenu</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>Odustani</button></div>
      </form> : <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold text-brand-700 dark:text-sky-300">{formatCurrency(row.amount)}</p><p className="mt-1 text-sm dark:text-slate-200">{row.description || 'Kupovina'}</p><p className="mt-1 text-xs text-slate-500">{row.source === 'gpt' ? 'Uneto preko ChatGPT-ja' : row.source === 'import' ? 'Preneto iz stare evidencije' : 'Uneto u aplikaciji'}</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(row); setAmount(String(row.amount)); setNote(row.description); setEditDate(row.date); setError(''); setDeleting(null); }}>Izmeni</button>
          {deleting === row.id ? <><button className="secondary text-rose-700 dark:text-rose-300" disabled={busy} onClick={async () => { if (await mutate(`/api/expenses/${row.id}`, 'DELETE', { version: row.version }, 'Kupovina je obrisana.')) setDeleting(null); }}>Potvrdi brisanje</button><button className="secondary" onClick={() => setDeleting(null)} disabled={busy}>Odustani</button></> : <button className="secondary" disabled={busy} onClick={() => setDeleting(row.id)}>Obriši</button>}
        </div>
      </div>}
    </li>)}</ul>
  </section>;
}
