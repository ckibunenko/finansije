import { useEffect, useState } from 'react';
import type { MonthBudget } from '../types';
import type { Mutate } from '../lib/api';
import { parseAmount } from '../../shared/budget';

export default function MonthSettings({ month, mutate, busy }: { month: MonthBudget; mutate: Mutate; busy: boolean }) {
  const [budget, setBudget] = useState(String(month.plannedMonthlyBudget));
  const [goal, setGoal] = useState(String(month.monthlySavingsGoal));
  const [version, setVersion] = useState(month.version ?? 0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!dirty) { setBudget(String(month.plannedMonthlyBudget)); setGoal(String(month.monthlySavingsGoal)); setVersion(month.version ?? 0); }
  }, [month.plannedMonthlyBudget, month.monthlySavingsGoal, month.version, dirty]);
  return <form className="grid gap-4 md:col-span-2 md:grid-cols-2" onSubmit={async (e) => {
    e.preventDefault(); if (busy) return;
    const plannedMonthlyBudget = parseAmount(budget), monthlySavingsGoal = parseAmount(goal);
    if (plannedMonthlyBudget === null || monthlySavingsGoal === null || monthlySavingsGoal > plannedMonthlyBudget) { setError('Unesite ispravne iznose; cilj štednje ne može biti veći od budžeta.'); return; }
    setError('');
    if (await mutate(`/api/months/${month.id}`, 'PUT', { plannedMonthlyBudget, monthlySavingsGoal, version }, 'Mesečni plan je sačuvan.')) setDirty(false);
  }}>
    <label className="space-y-2 text-sm font-medium text-slate-600 dark:text-slate-300">Planirani mesečni budžet<input className="field" inputMode="decimal" value={budget} disabled={busy} onChange={(e) => { setBudget(e.target.value); setDirty(true); }} /></label>
    <label className="space-y-2 text-sm font-medium text-slate-600 dark:text-slate-300">Mesečni cilj za štednju<input className="field" inputMode="decimal" value={goal} disabled={busy} onChange={(e) => { setGoal(e.target.value); setDirty(true); }} /></label>
    {dirty && <div className="space-y-2 md:col-span-2">
      {version !== (month.version ?? 0) && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">Plan je promenjen na drugom uređaju. Odbacite nacrt da učitate novi plan.</p>}
      <div className="flex gap-2"><button className="primary" disabled={busy || version !== (month.version ?? 0)}>Sačuvaj plan</button><button type="button" className="secondary" onClick={() => { setDirty(false); setError(''); }} disabled={busy}>Odbaci nacrt</button></div>
    </div>}
    {error && <p role="alert" className="text-sm text-rose-600 md:col-span-2">{error}</p>}
  </form>;
}
