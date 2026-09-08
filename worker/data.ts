import { belgradeToday, createMonthBudget, importedDinars, isRecord, parseImportedBudgetMap, toDinars, toParas, validDate, validMonth } from '../shared/budget.ts';
import type { BudgetState, Expense } from '../shared/budget.ts';
import { body, HttpError, json } from './http.ts';
import type { Env } from './http.ts';
import { hash } from './auth.ts';

type MonthRow = { id: string; budget: number; savings: number; version: number };
type ExpenseRow = { id: string; date: string; amount: number; description: string; source: Expense['source']; version: number; created_at: string; deleted_at: string | null; original_payload: string };
const expense = (row: ExpenseRow): Expense => ({
  id: row.id, date: row.date, amount: row.amount, description: row.description,
  source: row.source, version: row.version, createdAt: row.created_at,
});
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
function amount(value: unknown) {
  try { return toDinars(value); } catch (error) { throw new HttpError(400, (error as Error).message); }
}
function description(value: unknown) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > 160) throw new HttpError(400, 'Opis može imati do 160 znakova.');
  return value.trim();
}
export async function getState(env: Env): Promise<BudgetState> {
  // D1 batches execute in one transaction: the plan and expenses form one snapshot.
  const [months, purchases, revision] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM months ORDER BY id'),
    env.DB.prepare('SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date, created_at, id'),
    env.DB.prepare('SELECT version FROM state_revision WHERE id=1'),
  ]);
  const budgetMap: BudgetState['budgetMap'] = {};
  for (const row of months.results as unknown as MonthRow[]) {
    budgetMap[row.id] = { ...createMonthBudget(Number(row.id.slice(0, 4)), Number(row.id.slice(5))),
      plannedMonthlyBudget: row.budget, monthlySavingsGoal: row.savings, version: row.version };
  }
  const totals = new Map<string, number>();
  for (const row of purchases.results as unknown as ExpenseRow[]) {
    const id = row.date.slice(0, 7);
    budgetMap[id] ??= createMonthBudget(Number(id.slice(0, 4)), Number(id.slice(5)));
    const total = (totals.get(row.date) ?? 0) + row.amount;
    totals.set(row.date, total);
    budgetMap[id].entries[Number(row.date.slice(8)) - 1].amount = total;
  }
  return { budgetMap, expenses: (purchases.results as unknown as ExpenseRow[]).map(expense), today: belgradeToday(), revision: Number((revision.results[0] as { version: number }).version) };
}
export async function summary(env: Env, month: string) {
  if (!validMonth(month)) throw new HttpError(400, 'Mesec treba da bude u formatu YYYY-MM.');
  const [plans, totals, recent] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM months WHERE id=?').bind(month),
    env.DB.prepare('SELECT date,SUM(amount) AS amount,COUNT(*) AS count FROM expenses WHERE date>=? AND date<? AND deleted_at IS NULL GROUP BY date ORDER BY date').bind(month + '-01', month + '-32'),
    env.DB.prepare('SELECT * FROM expenses WHERE date>=? AND date<? AND deleted_at IS NULL ORDER BY date DESC,created_at DESC LIMIT 20').bind(month + '-01', month + '-32'),
  ]);
  const plan = plans.results[0] as unknown as MonthRow | undefined;
  const rows = totals.results as unknown as { date: string; amount: number; count: number }[];
  const spent = rows.reduce((sum, row) => sum + row.amount, 0);
  return json({ today: belgradeToday(), timezone: 'Europe/Belgrade', currency: 'RSD', month,
    budget: plan?.budget ?? 0, savingsGoal: plan?.savings ?? 0,
    totalSpent: spent, remainingBudget: (plan?.budget ?? 0) - spent,
    days: rows.map((row) => ({ date: row.date, amount: row.amount, purchases: row.count })),
    recentExpenses: (recent.results as unknown as ExpenseRow[]).map(expense),
    recentExpensesLimit: 20,
  });
}
export async function addExpense(request: Request, env: Env, source: 'web' | 'gpt') {
  const input = await body(request);
  if (!validId(input.requestId)) throw new HttpError(400, 'Potreban je jedinstven requestId (UUID). Ponovljeni pokušaj mora koristiti isti requestId.');
  if (!validDate(input.date)) throw new HttpError(400, 'Unesite ispravan datum YYYY-MM-DD.');
  const minor = amount(input.amount), note = description(input.description);
  const payload = JSON.stringify({ date: input.date, amount: minor, description: note, source });
  const inserted = await env.DB.prepare('INSERT INTO expenses(id,date,amount,description,source,created_at,original_payload) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING *')
    .bind(input.requestId, input.date, minor, note, source, new Date().toISOString(), payload).first<ExpenseRow>();
  const stored = inserted ?? await env.DB.prepare('SELECT * FROM expenses WHERE id=?').bind(input.requestId).first<ExpenseRow>();
  if (!stored || stored.original_payload !== payload) throw new HttpError(409, 'Ovaj requestId već pripada drugom unosu.');
  // A retried creation must never resurrect a deleted or edited purchase.
  return json({ expense: expense(stored), duplicate: !inserted, deleted: !!stored.deleted_at }, inserted ? 201 : 200);
}
export async function editExpense(request: Request, env: Env, id: string) {
  if (!validId(id)) throw new HttpError(400, 'Neispravan identifikator unosa.');
  const input = await body(request);
  if (!Number.isInteger(input.version) || Number(input.version) < 1) throw new HttpError(400, 'Nedostaje verzija unosa.');
  let updated: ExpenseRow | null;
  if (request.method === 'DELETE') {
    updated = await env.DB.prepare('UPDATE expenses SET deleted_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL RETURNING *')
      .bind(new Date().toISOString(), id, input.version).first<ExpenseRow>();
    if (!updated) {
      const existing = await env.DB.prepare('SELECT deleted_at FROM expenses WHERE id=?').bind(id).first<{ deleted_at: string | null }>();
      if (existing?.deleted_at) return json({ ok: true });
    }
  } else {
    if (!validDate(input.date)) throw new HttpError(400, 'Unesite ispravan datum.');
    updated = await env.DB.prepare('UPDATE expenses SET date=?,amount=?,description=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL RETURNING *')
      .bind(input.date, amount(input.amount), description(input.description), id, input.version).first<ExpenseRow>();
  }
  if (!updated) throw new HttpError(409, 'Unos je u međuvremenu promenjen. Osvežite pregled pre nove izmene.');
  return json({ ok: true, expense: expense(updated) });
}
export async function updateMonth(request: Request, env: Env, id: string) {
  if (!validMonth(id)) throw new HttpError(400, 'Neispravan mesec.');
  const input = await body(request);
  const budget = amount(input.plannedMonthlyBudget), savings = amount(input.monthlySavingsGoal);
  if (savings > budget) throw new HttpError(400, 'Cilj štednje ne može biti veći od mesečnog budžeta.');
  if (!Number.isInteger(input.version) || Number(input.version) < 0) throw new HttpError(400, 'Nedostaje verzija plana.');
  const updated = input.version === 0
    ? await env.DB.prepare('INSERT INTO months(id,budget,savings) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING RETURNING *').bind(id, budget, savings).first()
    : await env.DB.prepare('UPDATE months SET budget=?,savings=?,version=version+1 WHERE id=? AND version=? RETURNING *').bind(budget, savings, id, input.version).first();
  if (!updated) throw new HttpError(409, 'Plan je u međuvremenu promenjen. Osvežite pregled pa ponovite izmenu.');
  return json({ ok: true });
}

export function parseBackup(input: unknown) {
  const v2 = isRecord(input) && input.format === 'finansije-v2';
  const map = parseImportedBudgetMap(v2 ? input.budgetMap : input);
  const months = Object.values(map).map((m) => ({ id: m.id, budget: importedDinars(m.plannedMonthlyBudget), savings: importedDinars(m.monthlySavingsGoal) }));
  let expenses: { id: string; date: string; amount: number; description: string; source: Expense['source']; created_at: string }[];
  if (v2) {
    if (!Array.isArray(input.expenses) || input.expenses.length > 10000) throw new Error('Neispravna lista kupovina u rezervnoj kopiji.');
    const seen = new Set<string>();
    // Reconciliation stays exact and in paras, so a backup written before whole dinars is still
    // checked exactly as it was written; only the stored amount is rounded.
    const exactTotals = new Map<string, number>();
    expenses = input.expenses.map((raw: unknown) => {
      if (!isRecord(raw) || !validId(raw.id) || seen.has(raw.id) || !validDate(raw.date) || !map[raw.date.slice(0, 7)] ||
          !['web', 'gpt', 'import'].includes(String(raw.source)) || typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt))) throw new Error('Rezervna kopija sadrži neispravnu ili ponovljenu kupovinu.');
      seen.add(raw.id);
      exactTotals.set(raw.date, (exactTotals.get(raw.date) ?? 0) + toParas(raw.amount));
      return { id: raw.id, date: raw.date, amount: importedDinars(raw.amount), description: description(raw.description), source: raw.source as Expense['source'], created_at: new Date(raw.createdAt).toISOString() };
    });
    for (const month of Object.values(map)) for (const day of month.entries) {
      if ((exactTotals.get(day.date) ?? null) !== (day.amount === null ? null : toParas(day.amount))) throw new Error('Dnevni zbirovi u kopiji se ne slažu sa kupovinama.');
    }
  } else {
    expenses = Object.values(map).flatMap((m) => m.entries.filter((e) => e.amount !== null).map((e) => ({
      id: `legacy-${e.date}-total`, date: e.date, amount: importedDinars(e.amount),
      description: 'Prenet dnevni zbir iz stare evidencije', source: 'import' as const, created_at: `${e.date}T12:00:00.000Z`,
    })));
  }
  return { months, expenses };
}
export async function importBackup(request: Request, env: Env) {
  const input = await body(request, 1_000_000);
  let data: ReturnType<typeof parseBackup>;
  try { data = parseBackup(input); } catch (error) { throw new HttpError(400, (error as Error).message); }
  if (!data.months.length && !data.expenses.length) throw new HttpError(400, 'Kopija je prazna.');
  const fingerprint = await hash(JSON.stringify(data));
  const previous = await env.DB.prepare('SELECT fingerprint FROM imports WHERE id=1').first<{ fingerprint: string }>();
  if (previous?.fingerprint === fingerprint) return json({ ok: true, duplicate: true });
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO imports(id,fingerprint) VALUES ((SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM months) AND NOT EXISTS(SELECT 1 FROM expenses) THEN 1 ELSE 0 END),?)').bind(fingerprint),
      env.DB.prepare("INSERT INTO months(id,budget,savings) SELECT json_extract(value,'$.id'),json_extract(value,'$.budget'),json_extract(value,'$.savings') FROM json_each(?)").bind(JSON.stringify(data.months)),
      env.DB.prepare("INSERT INTO expenses(id,date,amount,description,source,created_at,original_payload) SELECT json_extract(value,'$.id'),json_extract(value,'$.date'),json_extract(value,'$.amount'),json_extract(value,'$.description'),json_extract(value,'$.source'),json_extract(value,'$.created_at'),'import' FROM json_each(?)").bind(JSON.stringify(data.expenses)),
    ]);
  } catch (error) {
    const imported = await env.DB.prepare('SELECT fingerprint FROM imports WHERE id=1').first<{ fingerprint: string }>();
    if (imported?.fingerprint === fingerprint) return json({ ok: true, duplicate: true });
    const existing = await env.DB.prepare('SELECT 1 FROM months UNION ALL SELECT 1 FROM expenses LIMIT 1').first();
    if (existing || imported) throw new HttpError(409, 'Zajednička evidencija već ima podatke. Uvoz je dozvoljen samo u praznu bazu da ne bi prepisao postojeće unose.');
    throw error;
  }
  return json({ ok: true, importedMonths: data.months.length, importedExpenses: data.expenses.length });
}
