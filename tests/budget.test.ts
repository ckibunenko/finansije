import test from 'node:test';
import assert from 'node:assert/strict';
import { belgradeToday, createMonthBudget, parseAmount, parseImportedBudgetMap, toDinars, validDate } from '../shared/budget.ts';
import { parseBackup } from '../worker/data.ts';

test('money rejects non-finite, negative, overflow and every amount in paras', () => {
  for (const value of [Infinity, NaN, -1, 100000001, 1.001, 0.29, 1450.5, '100']) assert.throws(() => toDinars(value));
  assert.equal(toDinars(1450), 1450);
  assert.equal(parseAmount('1.450'), 1450);
  assert.equal(parseAmount('+1400'), 1400);
  for (const value of ['', 'Infinity', '1e4', '1450,50', '1.45', '1,450', '1.4500', '-500']) assert.equal(parseAmount(value), null);
});
test('calendar validates leap years and resolves today in Belgrade', () => {
  assert.ok(validDate('2024-02-29'));
  for (const date of ['2026-02-29', '2026-09-31', '2026-13-01', '', '2026-02-00']) assert.equal(validDate(date), false);
  assert.equal(belgradeToday(new Date('2026-09-07T22:30:00Z')), '2026-09-08');
});
test('legacy import preserves zero vs missing and rejects silent date loss', () => {
  const month = createMonthBudget(2026, 9); month.entries[0].amount = 0; month.entries[1].amount = 123.45;
  const map = parseImportedBudgetMap({ '2026-09': month });
  assert.equal(map['2026-09'].entries[0].amount, 0); assert.equal(map['2026-09'].entries[2].amount, null);
  const imported = parseBackup({ '2026-09': month });
  assert.equal(imported.expenses.length, 2); assert.equal(imported.expenses[1].amount, 123);
  assert.throws(() => parseImportedBudgetMap({ '2026-09': { ...month, entries: [{ date: '2026-09-31', amount: 500 }] } }));
  assert.throws(() => parseImportedBudgetMap({ '2026-09': { ...month, id: '2026-08' } }));
  assert.throws(() => parseImportedBudgetMap({ '2026-09': { ...month, entries: [month.entries[0], month.entries[0]] } }));
});
test('versioned backup rejects inconsistent totals and rounds paras from older copies', () => {
  const month = createMonthBudget(2026, 9); month.entries[0].amount = 100;
  assert.throws(() => parseBackup({ format: 'finansije-v2', budgetMap: { '2026-09': month }, expenses: [] }));
  const older = createMonthBudget(2026, 9); older.entries[0].amount = 21;
  const purchase = (id: string, amount: number) => ({ id, date: '2026-09-01', amount, description: '', source: 'web', version: 1, createdAt: '2026-09-01T10:00:00.000Z' });
  // The day still reconciles in paras, and each purchase is rounded on the way in.
  const backup = { format: 'finansije-v2', budgetMap: { '2026-09': older }, expenses: [purchase('a'.repeat(16), 10.5), purchase('b'.repeat(16), 10.5)] };
  assert.deepEqual(parseBackup(backup).expenses.map((e) => e.amount), [11, 11]);
});
