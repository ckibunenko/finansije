export type DayEntry = { date: string; amount: number | null };
export type MonthBudget = {
  id: string; year: number; month: number;
  plannedMonthlyBudget: number; monthlySavingsGoal: number;
  entries: DayEntry[]; version?: number;
};
export type MonthBudgetMap = Record<string, MonthBudget>;
export type Expense = {
  id: string; date: string; amount: number; description: string;
  source: 'web' | 'gpt' | 'import'; version: number; createdAt: string;
};
export type BudgetState = { budgetMap: MonthBudgetMap; expenses: Expense[]; today: string; revision: number };

export const MAX_AMOUNT = 100_000_000;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const getMonthId = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
export const getDaysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(value);
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !validMonth(value.slice(0, 7))) return false;
  const [year, month, day] = value.split('-').map(Number);
  return day >= 1 && day <= getDaysInMonth(year, month);
}
export function toMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
    throw new Error('Iznos mora biti između 0 i 100.000.000 dinara, sa najviše dve decimale.');
  }
  return Math.round(value * 100);
}
// Decimal comma and ungrouped decimal dot are accepted; ambiguous grouping is rejected.
export function parseAmount(text: string): number | null {
  const value = text.trim().replace(/^\+\s*/, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  try { return toMinor(Number(value.replace(',', '.'))) / 100; } catch { return null; }
}
export const buildMonthEntries = (year: number, month: number): DayEntry[] =>
  Array.from({ length: getDaysInMonth(year, month) }, (_, index) => ({
    date: `${getMonthId(year, month)}-${String(index + 1).padStart(2, '0')}`, amount: null,
  }));
export const createMonthBudget = (year: number, month: number): MonthBudget => ({
  id: getMonthId(year, month), year, month, plannedMonthlyBudget: 0, monthlySavingsGoal: 0,
  entries: buildMonthEntries(year, month), version: 0,
});
export function belgradeToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((key) => parts.find((p) => p.type === key)!.value).join('-');
}
export function parseImportedBudgetMap(input: unknown): MonthBudgetMap {
  if (!isRecord(input) || Object.keys(input).length > 120) throw new Error('Izaberite ispravan JSON sa najviše 120 meseci.');
  const result: MonthBudgetMap = {};
  for (const [id, raw] of Object.entries(input)) {
    if (!validMonth(id) || !isRecord(raw) || raw.id !== id ||
        raw.year !== Number(id.slice(0, 4)) || raw.month !== Number(id.slice(5)) || !Array.isArray(raw.entries)) {
      throw new Error(`Mesec "${id}" nema ispravan format.`);
    }
    const month = createMonthBudget(raw.year as number, raw.month as number);
    month.plannedMonthlyBudget = toMinor(raw.plannedMonthlyBudget) / 100;
    month.monthlySavingsGoal = toMinor(raw.monthlySavingsGoal) / 100;
    const dates = new Set<string>();
    for (const entry of raw.entries) {
      if (!isRecord(entry) || !validDate(entry.date) || !entry.date.startsWith(id + '-') || dates.has(entry.date)) {
        throw new Error(`Mesec ${id} sadrži neispravan ili ponovljen datum.`);
      }
      dates.add(entry.date);
      month.entries[Number(entry.date.slice(8)) - 1].amount = entry.amount === null ? null : toMinor(entry.amount) / 100;
    }
    result[id] = month;
  }
  return result;
}
