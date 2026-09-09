import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMonthBudget,
  getDaysInMonth,
  getMonthId,
} from './lib/month-budget';
import { belgradeToday, parseAmount, validDate, validMonth } from '../shared/budget';
import { api, useBudget } from './lib/api';
import Login from './components/Login';
import MonthSettings from './components/MonthSettings';
import Purchases from './components/Purchases';
import Shortcut from './components/Shortcut';
import ImportPreview, { inspectImport } from './components/ImportPreview';

// The household works in whole dinars: no para anywhere in the interface. Amounts stay
// exact in the database and are rounded only here, at the moment they are shown.
const currency = new Intl.NumberFormat('sr-Latn-RS', {
  style: 'currency',
  currency: 'RSD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const percent = new Intl.NumberFormat('sr-Latn-RS', {
  maximumFractionDigits: 1,
});

const MONTH_NAMES_LATIN = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
] as const;

const ChartsPanel = lazy(() => import('./components/ChartsPanel'));
const THEME_STORAGE_KEY = 'finansije-prodavnica-theme';
const valueToneClasses = {
  brand: 'text-brand-700 dark:text-sky-300',
  neutral: 'text-slate-900 dark:text-slate-50',
  success: 'text-success-700 dark:text-emerald-300',
  danger: 'text-danger-700 dark:text-rose-300',
} as const;
const savingsGoalStatusClasses = {
  neutral:
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100',
  danger:
    'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/35 dark:text-rose-100',
} as const;

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return currency.format(value);
};

const formatMonthHeading = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number);
  return `${MONTH_NAMES_LATIN[month - 1]} ${year}.`;
};

const formatDayLabel = (dateString: string) => {
  const [, month, day] = dateString.split('-');
  return `${day}.${month}.`;
};

const shiftMonth = (monthId: string, offset: number) => {
  const [year, month] = monthId.split('-').map(Number);
  const nextDate = new Date(year, month - 1 + offset, 1);
  return getMonthId(nextDate.getFullYear(), nextDate.getMonth() + 1);
};

const getDefaultSelectedDate = (monthId: string) => {
  const today = belgradeToday();
  return monthId === today.slice(0, 7) ? today : monthId + '-01';
};

function App() {
  const budget = useBudget();
  const budgetMap = budget.data?.budgetMap ?? {};
  const today = budget.data?.today ?? belgradeToday();
  const initialMonthId = today.slice(0, 7);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    try { return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  const [activeMonthId, setActiveMonthId] = useState(initialMonthId);
  const [selectedDate, setSelectedDate] = useState(getDefaultSelectedDate(initialMonthId));
  const [draftAmount, setDraftAmount] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [importPreview, setImportPreview] = useState<unknown>(null);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const pendingPurchase = useRef<{ signature: string; requestId: string } | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferTone, setTransferTone] = useState<'success' | 'error'>('success');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Optional preference. */ }
  }, [theme]);

  useEffect(() => {
    setSelectedDate(getDefaultSelectedDate(activeMonthId));
    setDraftAmount('');
  }, [activeMonthId]);

  useEffect(() => {
    setDraftAmount(''); setDraftDescription('');
  }, [selectedDate]);

  useEffect(() => {
    if (!transferMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTransferMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [transferMessage]);

  const [activeYear, activeMonthNumber] = activeMonthId.split('-').map(Number);
  const activeMonth = budgetMap[activeMonthId] ?? createMonthBudget(activeYear, activeMonthNumber);
  const selectedEntry = activeMonth.entries.find((entry) => entry.date === selectedDate) ?? null;
  const selectedDayAmount = selectedEntry?.amount ?? null;
  const daysInMonth = getDaysInMonth(activeMonth.year, activeMonth.month);
  const plannedDailyAmount =
    activeMonth.plannedMonthlyBudget > 0 ? activeMonth.plannedMonthlyBudget / daysInMonth : 0;
  const allowedMonthlySpend = Math.max(activeMonth.plannedMonthlyBudget - activeMonth.monthlySavingsGoal, 0);
  const trimmedDraftAmount = draftAmount.trim();
  const parsedDraftAmount = parseAmount(trimmedDraftAmount);

  const tableRows = useMemo(() => {
    let cumulativeDifference = 0;
    let runningTotal = 0;
    let runningTrackedDays = 0;

    return activeMonth.entries.map((entry, index) => {
      const difference = entry.amount === null ? null : plannedDailyAmount - entry.amount;

      if (entry.amount !== null) {
        cumulativeDifference += difference ?? 0;
        runningTotal += entry.amount;
        runningTrackedDays += 1;
      }

      const runningAverage = runningTrackedDays > 0 ? runningTotal / runningTrackedDays : null;
      const state: 'neutral' | 'saved' | 'overspent' =
        entry.amount === null
          ? 'neutral'
          : entry.amount <= plannedDailyAmount
            ? 'saved'
            : 'overspent';

      return {
        id: entry.date,
        dayNumber: index + 1,
        dayLabel: formatDayLabel(entry.date),
        amount: entry.amount,
        planned: plannedDailyAmount,
        difference,
        runningAverage,
        cumulativeSpent: runningTotal,
        cumulativeDifference,
        targetCumulativeSpent: plannedDailyAmount * (index + 1),
        state,
      };
    });
  }, [activeMonth.entries, plannedDailyAmount]);

  const trackedRows = tableRows.filter((row) => row.amount !== null);
  const totalSpent = trackedRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const trackedDays = trackedRows.length;
  const overspentDays = trackedRows.filter((row) => (row.amount ?? 0) > plannedDailyAmount).length;
  const savedDays = trackedRows.filter((row) => (row.amount ?? 0) < plannedDailyAmount).length;
  const averageSpent = trackedDays > 0 ? totalSpent / trackedDays : 0;
  const projectedTotal = averageSpent * daysInMonth;
  const remainingBudget = activeMonth.plannedMonthlyBudget - totalSpent;
  const percentDaysBelowPlan = trackedDays > 0 ? (savedDays / trackedDays) * 100 : 0;
  const lastTrackedDay = trackedRows.length > 0 ? trackedRows[trackedRows.length - 1].dayNumber : 0;
  const currentCalendarDay = activeMonthId < initialMonthId ? daysInMonth : activeMonthId === initialMonthId ? Math.min(Number(today.slice(8)), daysInMonth) : 0;
  const referenceDay = Math.max(currentCalendarDay, lastTrackedDay);
  const plannedToReference = plannedDailyAmount * referenceDay;
  const remainingDaysForGoal = activeMonthId < initialMonthId ? 0 : activeMonthId === initialMonthId ? daysInMonth - Number(today.slice(8)) + 1 : daysInMonth;
  const remainingSpendForGoal = allowedMonthlySpend - totalSpent;
  const dailyLimitForGoal =
    remainingDaysForGoal > 0 ? remainingSpendForGoal / remainingDaysForGoal : remainingSpendForGoal;
  const maxExpense = trackedRows.length > 0 ? Math.max(...trackedRows.map((row) => row.amount ?? 0)) : null;
  const minExpense = trackedRows.length > 0 ? Math.min(...trackedRows.map((row) => row.amount ?? 0)) : null;
  const totalDifference = trackedRows.reduce((sum, row) => sum + (row.difference ?? 0), 0);
  const expectedSavings = activeMonth.plannedMonthlyBudget - projectedTotal;
  const onSavingsGoalTrack =
    activeMonth.monthlySavingsGoal <= 0
      ? null
      : expectedSavings >= activeMonth.monthlySavingsGoal;
  const projectionOverBudget =
    activeMonth.plannedMonthlyBudget > 0 ? projectedTotal > activeMonth.plannedMonthlyBudget : null;
  const hasSavingsGoalContext =
    activeMonth.plannedMonthlyBudget > 0 && activeMonth.monthlySavingsGoal > 0;
  const savingsGoalStatus = !hasSavingsGoalContext ? 'neutral' : dailyLimitForGoal < 0 ? 'danger' : 'success';
  const savingsGoalValue = hasSavingsGoalContext && remainingDaysForGoal > 0 ? formatCurrency(dailyLimitForGoal) : '—';
  const savingsGoalMessage =
    savingsGoalStatus === 'neutral'
      ? 'Unesite budžet i cilj štednje da bi se limit izračunao.'
      : remainingDaysForGoal === 0
        ? 'Mesec je završen; dnevni limit više nije primenljiv.'
      : savingsGoalStatus === 'danger'
        ? 'Cilj je trenutno probijen i potrebno je smanjenje troška.'
        : dailyLimitForGoal === 0
          ? 'Cilj je dostižan samo ako do kraja meseca nema dodatne potrošnje.'
          : 'Prosečan preostali dnevni iznos, uključujući ostatak današnjeg dana.';
  const selectedDayLabel = formatDayLabel(selectedDate);
  const selectedDayMessage =
    selectedDayAmount === null
      ? `Za ${selectedDayLabel} još nema unosa.`
      : `Za ${selectedDayLabel} trenutno je upisano ${formatCurrency(selectedDayAmount)}.`;
  const draftPreviewMessage = parsedDraftAmount === null ? null :
    'Sa ovom kupovinom ukupan trošak za ' + selectedDayLabel + ' bi bio ' + formatCurrency((selectedDayAmount ?? 0) + parsedDraftAmount) + '.';
  const monthFocusMessage =
    projectionOverBudget === null
      ? 'Unesite budžet da bismo procenili tempo meseca.'
      : projectionOverBudget
        ? 'Trenutni tempo vodi iznad planiranog budžeta.'
        : 'Trenutni tempo je i dalje unutar planiranog budžeta.';
  const savingsGoalTrackMessage =
    onSavingsGoalTrack === null
      ? 'Dodajte cilj štednje da bismo pratili ostvarenje.'
      : onSavingsGoalTrack
        ? 'Sa ovim prosekom cilj je i dalje dostižan.'
        : 'Sa ovim prosekom cilj trenutno nije dostižan.';

  const donutData = [
    {
      name: 'Potrošeno u budžetu',
      value: Math.min(totalSpent, Math.max(activeMonth.plannedMonthlyBudget, 0)),
      color: '#2563eb',
    },
    {
      name: 'Preostalo',
      value: Math.max(activeMonth.plannedMonthlyBudget - totalSpent, 0),
      color: '#cbd5e1',
    },
    {
      name: 'Prekoračenje',
      value: Math.max(totalSpent - activeMonth.plannedMonthlyBudget, 0),
      color: '#ef4444',
    },
  ].filter((segment) => segment.value > 0);

  const handleAmountSubmit = async () => {
    if (budget.busy) return;
    if (parsedDraftAmount === null || !validDate(selectedDate) || !selectedDate.startsWith(activeMonthId)) {
      setTransferTone('error'); setTransferMessage('Unesite iznos kupovine i ispravan datum. Prazno polje ne briše kupovine.'); return;
    }
    const payload = { date: selectedDate, amount: parsedDraftAmount, description: draftDescription.trim() };
    const signature = JSON.stringify(payload);
    if (pendingPurchase.current?.signature !== signature) pendingPurchase.current = { signature, requestId: crypto.randomUUID() };
    if (await budget.mutate('/api/expenses', 'POST', { ...payload, requestId: pendingPurchase.current.requestId }, 'Sačuvana je kupovina od ' + formatCurrency(parsedDraftAmount) + ' za ' + selectedDayLabel + '.')) {
      pendingPurchase.current = null; setDraftAmount(''); setDraftDescription(''); setTransferMessage(null);
    }
  };

  const handleExportJson = async () => {
    let payload: string;
    try { payload = JSON.stringify(await api('/api/export'), null, 2); }
    catch (error) { setTransferTone('error'); setTransferMessage((error as Error).message); return; }
    const blob = new Blob([payload], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const exportDate = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `finansije-prodavnica-${exportDate}.json`;
    link.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    setTransferTone('success');
    setTransferMessage('Podaci su izvezeni u JSON fajl.');
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      if (file.size > 1_000_000) throw new Error('JSON fajl može imati najviše 1 MB.');
      const fileContent = await file.text();
      const parsedJson = JSON.parse(fileContent) as unknown;
      inspectImport(parsedJson);
      setImportPreview(parsedJson);
    } catch (error) {
      setTransferTone('error');
      setTransferMessage(error instanceof Error ? error.message : 'Import nije uspeo.');
    } finally {
      event.target.value = '';
    }
  };

  if (budget.auth === 'required') return <Login onLogin={budget.reload} />;
  if (!budget.data) return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold dark:text-white">Naše finansije</h1><p role="status" className="mt-4 text-slate-500">{budget.message || 'Učitavanje zajedničke evidencije…'}</p>{budget.failed && <button className="primary mt-5" onClick={() => void budget.reload().catch(() => {})}>Pokušaj ponovo</button>}</div></main>;

  return (
    <div className="min-h-screen bg-halo px-4 py-6 text-ink transition-colors dark:bg-none dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 text-sm dark:bg-slate-900 dark:text-slate-200">
          <div role={budget.failed ? 'alert' : 'status'} aria-live="polite" className={budget.failed ? 'text-rose-700 dark:text-rose-300' : ''}>
            {budget.message || 'Zajednička evidencija'}
            {budget.lastSynced && <span className="ml-2 text-xs text-slate-500">Osveženo {budget.lastSynced.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          <div className="flex gap-2"><button className="secondary" disabled={budget.busy} onClick={() => void budget.reload().catch(() => {})}>Osveži</button><button className="secondary" disabled={budget.busy} onClick={() => void budget.signOut()}>Odjavi se</button></div>
        </div>
        <header className="rounded-[28px] border border-white/60 bg-white/85 p-6 shadow-soft backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.55)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-brand-700 dark:bg-sky-500/15 dark:text-sky-300">
                Dnevni troškovi prodavnice
              </span>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-ink dark:text-white sm:text-4xl">
                  Finansijski pregled za {formatMonthHeading(activeMonthId)}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                  Jedan pregled po mesecu, automatski obračun plana i jasan uvid u to da li smo u
                  zoni uštede ili prekoračenja.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    disabled={budget.busy || activeMonthId === '1900-01'}
                    onClick={() => setActiveMonthId((current) => shiftMonth(current, -1))}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-200"
                  >
                    Prethodni mesec
                  </button>
                  <input
                    type="month"
                    disabled={budget.busy}
                    value={activeMonthId}
                    min="1900-01" max="2200-12" aria-label="Mesec pregleda"
                    onChange={(event) => { if (validMonth(event.target.value)) setActiveMonthId(event.target.value); }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none ring-0 transition focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400"
                  />
                  <button
                    type="button"
                    disabled={budget.busy || activeMonthId === '2200-12'}
                    onClick={() => setActiveMonthId((current) => shiftMonth(current, 1))}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-200"
                  >
                    Sledeći mesec
                  </button>
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-400 dark:hover:text-sky-200"
                  >
                    {theme === 'light' ? 'Dark mod' : 'Light mod'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-200"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleImportClick}
                    className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-900 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                  >
                    Import JSON
                  </button>
                </div>

                {transferMessage ? (
                  <p
                    className={`text-right text-xs leading-5 ${
                      transferTone === 'success'
                        ? 'text-success-700 dark:text-emerald-300'
                        : 'text-danger-700 dark:text-rose-300'
                    }`}
                  >
                    {transferMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </header>
        {Object.keys(budgetMap).length === 0 && <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <p>Imate staru evidenciju? Prenesite je pre prvog novog unosa. Ako je na drugoj adresi ili uređaju, tamo izvezite JSON i ovde izaberite Import JSON.</p>
          <button className="secondary mt-3" onClick={() => {
            try {
              const raw = localStorage.getItem('finansije-prodavnica-v1');
              if (!raw) throw new Error('Na ovoj adresi nema stare evidencije. Uvezite prethodno izvezen JSON fajl.');
              const parsed = JSON.parse(raw); inspectImport(parsed); setImportPreview(parsed);
            } catch (error) { setTransferTone('error'); setTransferMessage((error as Error).message); }
          }}>Proveri stare podatke u ovom browseru</button>
        </div>}

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-ink dark:text-white">Dnevni unos</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Sve bitno za izabrani datum je ovde: trenutni total, plan i unos novog troška.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MonthSettings key={activeMonthId} month={activeMonth} mutate={budget.mutate} busy={budget.busy} />
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Datum unosa</span>
                <input
                  type="date"
                  value={selectedDate}
                  min={`${activeMonthId}-01`}
                  max={`${activeMonthId}-${String(daysInMonth).padStart(2, '0')}`}
                  disabled={budget.busy}
                  onChange={(event) => { if (validDate(event.target.value) && event.target.value.startsWith(activeMonthId)) setSelectedDate(event.target.value); }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:bg-slate-800"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Nova kupovina (din)</span>
                <input
                  type="text"
                  inputMode="numeric" disabled={budget.busy}
                  value={draftAmount}
                  onChange={(event) => setDraftAmount(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleAmountSubmit();
                    }
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:bg-slate-800"
                  placeholder="npr. 1450 ili 1450,50"
                />
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Iznos se dodaje na dnevni zbir. Za dan bez potrošnje unesite 0.
                </p>
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{selectedDayMessage}</p>
                {draftPreviewMessage ? (
                  <p className="text-xs leading-5 text-brand-700 dark:text-sky-300">{draftPreviewMessage}</p>
                ) : null}
              </label>
            </div>
            <label className="mt-4 block space-y-2"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Opis kupovine (opciono)</span><input className="field" value={draftDescription} maxLength={160} disabled={budget.busy} onChange={(e) => setDraftDescription(e.target.value)} placeholder="npr. Maxi, namirnice" /></label>
            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)_auto] lg:items-stretch">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Dnevni plan
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink dark:text-white">
                  {formatCurrency(plannedDailyAmount)}
                </p>
              </div>
              <div
                className={`rounded-2xl border px-4 py-4 transition-colors ${savingsGoalStatusClasses[savingsGoalStatus]}`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
                  Dnevno za cilj štednje
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{savingsGoalValue}</p>
                <p className="mt-2 text-sm leading-6 opacity-90">{savingsGoalMessage}</p>
              </div>
              <button
                type="button"
                onClick={handleAmountSubmit}
                disabled={budget.busy || parsedDraftAmount === null}
                className="border-2 border-amber-200/80 bg-gradient-to-br from-[#ffe27a] via-[#f5c116] to-[#c98600] px-6 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-[#4b2a00] shadow-[0_14px_28px_rgba(201,134,0,0.38)] transition hover:-translate-y-0.5 hover:from-[#ffea8f] hover:via-[#ffd447] hover:to-[#d99810] hover:shadow-[0_18px_34px_rgba(201,134,0,0.46)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200/60 active:translate-y-0 [border-radius:30px_10px_30px_10px] lg:self-center"
              >
                {budget.busy ? 'Čuvanje…' : 'Dodaj kupovinu'}
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-brand-100 bg-gradient-to-br from-brand-900 via-ink to-brand-700 p-6 text-white shadow-soft dark:border-sky-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950">
            <div className="flex h-full flex-col justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-brand-100">Fokus sada</p>
                <h2 className="mt-2 text-2xl font-semibold">Šta je najbitnije za {selectedDayLabel}?</h2>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-sm text-brand-100">Trenutno upisano za izabrani dan</p>
                <p className="mt-2 text-3xl font-semibold">{formatCurrency(selectedDayAmount)}</p>
                <p className="mt-2 text-sm text-brand-50">{selectedDayMessage}</p>
                {draftPreviewMessage ? <p className="mt-2 text-sm text-sky-100">{draftPreviewMessage}</p> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-sm text-brand-100">Preostali budžet</p>
                  <p className="mt-2 text-2xl font-semibold">{formatCurrency(remainingBudget)}</p>
                  <p className="mt-2 text-sm text-brand-50">{monthFocusMessage}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-sm text-brand-100">Cilj štednje</p>
                  <p className="mt-2 text-2xl font-semibold">{formatCurrency(activeMonth.monthlySavingsGoal)}</p>
                  <p className="mt-2 text-sm text-brand-50">{savingsGoalTrackMessage}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              label: 'Ukupno potrošeno',
              value: formatCurrency(totalSpent),
              tone: valueToneClasses.brand,
              detail: `${trackedDays} dana sa unosom`,
            },
            {
              label: 'Ukupna ušteda / prekoračenje',
              value: formatCurrency(totalDifference),
              tone: totalDifference >= 0 ? valueToneClasses.success : valueToneClasses.danger,
              detail: totalDifference >= 0 ? 'Pozitivan saldo u odnosu na plan' : 'Potrošnja iznad plana',
            },
            {
              label: 'Prosečna dnevna potrošnja',
              value: formatCurrency(averageSpent),
              tone: valueToneClasses.neutral,
              detail: 'Na osnovu unetih dana',
            },
            {
              label: 'Dani sa unosom',
              value: `${trackedDays}/${daysInMonth}`,
              tone: valueToneClasses.neutral,
              detail: `${savedDays} dana uštede / ${overspentDays} dana prekoračenja`,
            },
            {
              label: 'Preostali budžet',
              value: formatCurrency(remainingBudget),
              tone: remainingBudget >= 0 ? valueToneClasses.success : valueToneClasses.danger,
              detail: remainingBudget >= 0 ? 'Ima prostora do kraja meseca' : 'Budžet je probijen',
            },
          ].map((card) => (
            <article
              key={card.label}
              className="rounded-[24px] border border-white/60 bg-white/90 p-5 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_14px_32px_rgba(2,6,23,0.35)]"
            >
              <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
              <p className={`mt-3 text-3xl font-semibold tracking-tight ${card.tone}`}>{card.value}</p>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{card.detail}</p>
            </article>
          ))}
        </section>

        <Purchases key={selectedDate} expenses={budget.data.expenses} date={selectedDate} busy={budget.busy} mutate={budget.mutate} formatCurrency={formatCurrency} />

        <section className="grid min-w-0 grid-cols-1 gap-6 2xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-ink dark:text-white">Uneti dani</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Prikazani su samo dani za koje postoji zabeležen trošak.
              </p>
            </div>
            {trackedRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-800/80">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Još nema zabeleženih troškova za ovaj mesec.
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Dodaj prvi unos iznad da bi se ovde pojavila istorija troškova.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Datum</th>
                      <th className="px-4 py-3 font-semibold">Iznos (din)</th>
                      <th className="px-4 py-3 font-semibold">Planirano (din)</th>
                      <th className="px-4 py-3 font-semibold">Razlika (din)</th>
                      <th className="px-4 py-3 font-semibold">Dnevni prosek (din)</th>
                      <th className="px-4 py-3 font-semibold">Kumulativna ušteda (din)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackedRows.map((row) => {
                      const rowTone =
                        row.state === 'saved'
                          ? 'bg-success-50/70 dark:bg-emerald-950/35'
                          : 'bg-danger-50/70 dark:bg-rose-950/30';

                      return (
                        <tr key={row.id} className={`border-t border-slate-100 dark:border-slate-800 ${rowTone}`}>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                            <button className="underline decoration-dotted underline-offset-4" onClick={() => { setSelectedDate(row.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{row.dayLabel}</button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-brand-700 dark:text-sky-300">
                            {formatCurrency(row.amount)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                            {formatCurrency(row.planned)}
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-3 font-medium ${
                              row.difference !== null && row.difference >= 0
                                ? 'text-success-700 dark:text-emerald-300'
                                : 'text-danger-700 dark:text-rose-300'
                            }`}
                          >
                            {formatCurrency(row.difference)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                            {formatCurrency(row.runningAverage)}
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-3 font-medium ${
                              row.cumulativeDifference >= 0
                                ? 'text-success-700 dark:text-emerald-300'
                                : 'text-danger-700 dark:text-rose-300'
                            }`}
                          >
                            {formatCurrency(row.cumulativeDifference)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-ink dark:text-white">Rekapitulacija</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Detaljan sažetak plana, stvarne potrošnje i kretanja kroz mesec.
              </p>
            </div>
            <dl className="grid gap-3">
              {[
                ['Ukupno potrošeno', formatCurrency(totalSpent)],
                ['Ukupno planirano za mesec', formatCurrency(activeMonth.plannedMonthlyBudget)],
                ['Planirano do danas / poslednjeg unosa', formatCurrency(plannedToReference)],
                ['Ukupna ušteda / prekoračenje', formatCurrency(totalDifference)],
                ['Prosečna dnevna potrošnja', formatCurrency(averageSpent)],
                ['Projekcija do kraja meseca', formatCurrency(projectedTotal)],
                ['Preostali budžet', formatCurrency(remainingBudget)],
                ['Preostali dnevni limit za cilj štednje', savingsGoalValue],
                ['Dana praćeno', String(trackedDays)],
                ['Dana prekoračeno', String(overspentDays)],
                ['Dana ušteđeno', String(savedDays)],
                ['Najveći trošak', formatCurrency(maxExpense)],
                ['Najmanji trošak', formatCurrency(minExpense)],
                ['% dana ispod plana', `${percent.format(percentDaysBelowPlan)}%`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/90"
                >
                  <dt className="text-sm text-slate-600 dark:text-slate-300">{label}</dt>
                  <dd className="text-sm font-semibold text-ink dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Suspense
            fallback={
              <div className="col-span-full rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft">
                <p className="text-sm text-slate-500">Učitavanje grafikona...</p>
              </div>
            }
          >
            <ChartsPanel
              activeMonthBudget={activeMonth.plannedMonthlyBudget}
              cumulativeActualCutoffDay={referenceDay}
              donutData={donutData}
              formatCurrency={formatCurrency}
              theme={theme}
              tableRows={trackedRows}
              allRows={tableRows}
            />
          </Suspense>
        </section>
        <Shortcut devices={budget.data?.devices ?? 0} busy={budget.busy} onChanged={() => { void budget.reload().catch(() => {}); }} />
        <footer className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-500">
          <a href="/privacy">Privatnost · Naše finansije</a>
          {disconnectConfirm ? <div className="flex gap-2"><button className="secondary" disabled={budget.busy} onClick={async () => { if (await budget.mutate('/api/disconnect-gpt', 'POST', {}, 'GPT pristup je opozvan na svim nalozima.')) setDisconnectConfirm(false); }}>Potvrdi opoziv GPT pristupa</button><button className="secondary" onClick={() => setDisconnectConfirm(false)}>Odustani</button></div> : <button className="secondary" onClick={() => setDisconnectConfirm(true)}>Opozovi GPT pristup</button>}
        </footer>
      </div>

      {importPreview !== null && <ImportPreview input={importPreview} onClose={() => setImportPreview(null)} mutate={budget.mutate} busy={budget.busy} error={budget.failed ? budget.message : undefined} />}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportJson}
        className="hidden"
      />
    </div>
  );
}

export default App;
