import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMonthBudget,
  ensureMonthBudget,
  getDaysInMonth,
  getMonthId,
  loadBudgetMap,
  parseImportedBudgetMap,
  persistBudgetMap,
} from './lib/month-budget';
import type { MonthBudgetMap } from './types';

const currency = new Intl.NumberFormat('sr-Latn-RS', {
  style: 'currency',
  currency: 'RSD',
  maximumFractionDigits: 0,
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

const today = new Date();
const initialMonthId = getMonthId(today.getFullYear(), today.getMonth() + 1);
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
  if (value === null || value === undefined || Number.isNaN(value)) {
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
  if (monthId === initialMonthId) {
    return `${monthId}-${String(today.getDate()).padStart(2, '0')}`;
  }

  return `${monthId}-01`;
};

function App() {
  const [budgetMap, setBudgetMap] = useState<MonthBudgetMap>(() =>
    ensureMonthBudget(loadBudgetMap(), today.getFullYear(), today.getMonth() + 1),
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  });
  const [activeMonthId, setActiveMonthId] = useState(initialMonthId);
  const [selectedDate, setSelectedDate] = useState(getDefaultSelectedDate(initialMonthId));
  const [draftAmount, setDraftAmount] = useState('');
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferTone, setTransferTone] = useState<'success' | 'error'>('success');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    persistBudgetMap(budgetMap);
  }, [budgetMap]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const [year, month] = activeMonthId.split('-').map(Number);
    setBudgetMap((current) => ensureMonthBudget(current, year, month));
    setSelectedDate(getDefaultSelectedDate(activeMonthId));
    setDraftAmount('');
  }, [activeMonthId]);

  useEffect(() => {
    setDraftAmount('');
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
  const isIncrementDraft = trimmedDraftAmount.startsWith('+');
  const rawDraftAmount = isIncrementDraft ? trimmedDraftAmount.slice(1).trim() : trimmedDraftAmount;
  const parsedDraftAmount =
    rawDraftAmount === '' || Number.isNaN(Number(rawDraftAmount)) || Number(rawDraftAmount) < 0
      ? null
      : Number(rawDraftAmount);

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
  const currentCalendarDay = activeMonthId === initialMonthId ? Math.min(today.getDate(), daysInMonth) : 0;
  const referenceDay = Math.max(currentCalendarDay, lastTrackedDay);
  const plannedToReference = plannedDailyAmount * referenceDay;
  const remainingDaysForGoal = Math.max(daysInMonth - referenceDay, 0);
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
  const savingsGoalValue = hasSavingsGoalContext ? formatCurrency(dailyLimitForGoal) : '—';
  const savingsGoalMessage =
    savingsGoalStatus === 'neutral'
      ? 'Unesite budžet i cilj štednje da bi se limit izračunao.'
      : savingsGoalStatus === 'danger'
        ? 'Cilj je trenutno probijen i potrebno je smanjenje troška.'
        : dailyLimitForGoal === 0
          ? 'Cilj je dostižan samo ako do kraja meseca nema dodatne potrošnje.'
          : 'Toliki je prosečan dnevni maksimum do kraja meseca.';
  const selectedDayLabel = formatDayLabel(selectedDate);
  const selectedDayMessage =
    selectedDayAmount === null
      ? `Za ${selectedDayLabel} još nema unosa.`
      : `Za ${selectedDayLabel} trenutno je upisano ${formatCurrency(selectedDayAmount)}.`;
  const draftPreviewMessage =
    parsedDraftAmount === null
      ? null
      : isIncrementDraft
        ? `Sa ovim unosom ukupan trošak za ${selectedDayLabel} bi bio ${formatCurrency(
            (selectedDayAmount ?? 0) + parsedDraftAmount,
          )}.`
        : selectedDayAmount !== parsedDraftAmount
          ? `Ovim unosom postavljaš ukupan trošak za ${selectedDayLabel} na ${formatCurrency(parsedDraftAmount)}.`
          : null;
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

  const updateActiveMonth = (
    updater: (current: NonNullable<MonthBudgetMap[string]>) => NonNullable<MonthBudgetMap[string]>,
  ) => {
    setBudgetMap((current) => ({
      ...current,
      [activeMonthId]: updater(current[activeMonthId] ?? activeMonth),
    }));
  };

  const handleAmountSubmit = () => {
    if (trimmedDraftAmount !== '' && parsedDraftAmount === null) {
      setTransferTone('error');
      setTransferMessage('Unesite broj ili dodatni trošak u formatu kao +1400.');
      return;
    }

    let nextAmount: number | null = null;

    if (trimmedDraftAmount !== '') {
      nextAmount = isIncrementDraft ? (selectedDayAmount ?? 0) + (parsedDraftAmount ?? 0) : parsedDraftAmount;
    }

    updateActiveMonth((current) => ({
      ...current,
      entries: current.entries.map((entry) => {
        if (entry.date !== selectedDate) {
          return entry;
        }

        if (trimmedDraftAmount === '') {
          return { ...entry, amount: null };
        }

        return { ...entry, amount: nextAmount };
      }),
    }));
    setTransferTone('success');
    setTransferMessage(
      trimmedDraftAmount === ''
        ? `Unos za ${selectedDayLabel} je obrisan.`
        : isIncrementDraft
          ? `Dodat je trošak od ${formatCurrency(parsedDraftAmount)}. Novi total za ${selectedDayLabel} je ${formatCurrency(nextAmount)}.`
          : selectedDayAmount === null
            ? `Sačuvan je trošak od ${formatCurrency(nextAmount)} za ${selectedDayLabel}.`
            : `Ukupan trošak za ${selectedDayLabel} je ažuriran na ${formatCurrency(nextAmount)}.`
    );
    setDraftAmount('');
  };

  const handleExportJson = () => {
    const payload = JSON.stringify(budgetMap, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const exportDate = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `finansije-prodavnica-${exportDate}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
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
      const fileContent = await file.text();
      const parsedJson = JSON.parse(fileContent) as unknown;
      const importedMap = parseImportedBudgetMap(parsedJson);

      setBudgetMap((current) => ({
        ...current,
        ...importedMap,
      }));
      setTransferTone('success');
      setTransferMessage('JSON je uspešno uvezen u lokalne podatke.');
    } catch (error) {
      setTransferTone('error');
      setTransferMessage(error instanceof Error ? error.message : 'Import nije uspeo.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-halo px-4 py-6 text-ink transition-colors dark:bg-none dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
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
                    onClick={() => setActiveMonthId((current) => shiftMonth(current, -1))}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-200"
                  >
                    Prethodni mesec
                  </button>
                  <input
                    type="month"
                    value={activeMonthId}
                    onChange={(event) => setActiveMonthId(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none ring-0 transition focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400"
                  />
                  <button
                    type="button"
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

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-soft dark:border-slate-700/70 dark:bg-slate-900/80 dark:shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-ink dark:text-white">Dnevni unos</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Sve bitno za izabrani datum je ovde: trenutni total, plan i unos novog troška.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Planirani mesečni budžet</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={activeMonth.plannedMonthlyBudget || ''}
                  onChange={(event) =>
                    updateActiveMonth((current) => ({
                      ...current,
                      plannedMonthlyBudget: Number(event.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:bg-slate-800"
                  placeholder="npr. 180000"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Mesečni cilj za štednju</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={activeMonth.monthlySavingsGoal || ''}
                  onChange={(event) =>
                    updateActiveMonth((current) => ({
                      ...current,
                      monthlySavingsGoal: Number(event.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:bg-slate-800"
                  placeholder="npr. 20000"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Datum unosa</span>
                <input
                  type="date"
                  value={selectedDate}
                  min={`${activeMonthId}-01`}
                  max={`${activeMonthId}-${String(daysInMonth).padStart(2, '0')}`}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:bg-slate-800"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Dnevni trošak</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draftAmount}
                  onChange={(event) => setDraftAmount(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleAmountSubmit();
                    }
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:bg-slate-800"
                  placeholder="npr. 5400 ili +1400"
                />
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Unesi puni iznos ili dodaj novi trošak za isti dan preko formata kao `+1400`.
                </p>
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{selectedDayMessage}</p>
                {draftPreviewMessage ? (
                  <p className="text-xs leading-5 text-brand-700 dark:text-sky-300">{draftPreviewMessage}</p>
                ) : null}
              </label>
            </div>
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
                className="border-2 border-amber-200/80 bg-gradient-to-br from-[#ffe27a] via-[#f5c116] to-[#c98600] px-6 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-[#4b2a00] shadow-[0_14px_28px_rgba(201,134,0,0.38)] transition hover:-translate-y-0.5 hover:from-[#ffea8f] hover:via-[#ffd447] hover:to-[#d99810] hover:shadow-[0_18px_34px_rgba(201,134,0,0.46)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200/60 active:translate-y-0 [border-radius:30px_10px_30px_10px] lg:self-center"
              >
                Sačuvaj unos
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

        <section className="grid gap-6 2xl:grid-cols-[1.4fr_1fr]">
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
                            {row.dayLabel}
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
                ['Preostali dnevni limit za cilj štednje', formatCurrency(dailyLimitForGoal)],
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
      </div>

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
