import type { DayEntry, MonthBudget, MonthBudgetMap } from '../types';

const STORAGE_KEY = 'finansije-prodavnica-v1';

export const getMonthId = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

export const getDaysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

export const buildMonthEntries = (year: number, month: number): DayEntry[] => {
  const daysInMonth = getDaysInMonth(year, month);

  return Array.from({ length: daysInMonth }, (_, index) => ({
    date: `${getMonthId(year, month)}-${String(index + 1).padStart(2, '0')}`,
    amount: null,
  }));
};

export const createMonthBudget = (year: number, month: number): MonthBudget => ({
  id: getMonthId(year, month),
  year,
  month,
  plannedMonthlyBudget: 0,
  monthlySavingsGoal: 0,
  entries: buildMonthEntries(year, month),
});

export const normalizeMonthBudget = (monthBudget: MonthBudget): MonthBudget => {
  const baseEntries = buildMonthEntries(monthBudget.year, monthBudget.month);
  const entryMap = new Map(monthBudget.entries.map((entry) => [entry.date, entry.amount]));

  return {
    ...monthBudget,
    entries: baseEntries.map((entry) => ({
      ...entry,
      amount: entryMap.get(entry.date) ?? null,
    })),
  };
};

export const ensureMonthBudget = (
  data: MonthBudgetMap,
  year: number,
  month: number,
): MonthBudgetMap => {
  const id = getMonthId(year, month);

  if (data[id]) {
    return {
      ...data,
      [id]: normalizeMonthBudget(data[id]),
    };
  }

  return {
    ...data,
    [id]: createMonthBudget(year, month),
  };
};

export const loadBudgetMap = (): MonthBudgetMap => {
  if (typeof window === 'undefined') {
    return {};
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as MonthBudgetMap;
    return Object.fromEntries(
      Object.entries(parsed).map(([id, monthBudget]) => [id, normalizeMonthBudget(monthBudget)]),
    );
  } catch {
    return {};
  }
};

export const persistBudgetMap = (data: MonthBudgetMap) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDayEntry = (value: unknown): value is DayEntry =>
  isRecord(value) &&
  typeof value.date === 'string' &&
  (typeof value.amount === 'number' || value.amount === null);

const isMonthBudget = (value: unknown): value is MonthBudget =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.year === 'number' &&
  typeof value.month === 'number' &&
  typeof value.plannedMonthlyBudget === 'number' &&
  typeof value.monthlySavingsGoal === 'number' &&
  Array.isArray(value.entries) &&
  value.entries.every(isDayEntry);

export const parseImportedBudgetMap = (input: unknown): MonthBudgetMap => {
  if (!isRecord(input)) {
    throw new Error('JSON fajl nema ispravan format.');
  }

  const parsedEntries = Object.entries(input).map(([id, monthBudget]) => {
    if (!isMonthBudget(monthBudget)) {
      throw new Error(`Mesec "${id}" nema ispravan format.`);
    }

    return [id, normalizeMonthBudget(monthBudget)] as const;
  });

  return Object.fromEntries(parsedEntries);
};
