import test from 'node:test';
import assert from 'node:assert/strict';
import { belgradeToday, createMonthBudget, parseAmount, parseImportedBudgetMap, toMinor, validDate } from '../shared/budget.ts';
import { parseBackup } from '../worker/data.ts';

test('money rejects non-finite, negative, overflow and more than two decimals', () => {
  for (const value of [Infinity, NaN, -1, 100000001, 1.001, '100']) assert.throws(() => toMinor(value));
  assert.equal(toMinor(0.29), 29);
  assert.equal(parseAmount('1450,50'), 1450.5);
  assert.equal(parseAmount('+1400'), 1400);
  for (const value of ['', 'Infinity', '1e4', '1.450', '1,450', '-500']) assert.equal(parseAmount(value), null);
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
  assert.equal(imported.expenses.length, 2); assert.equal(imported.expenses[1].amount, 12345);
  assert.throws(() => parseImportedBudgetMap({ '2026-09': { ...month, entries: [{ date: '2026-09-31', amount: 500 }] } }));
  assert.throws(() => parseImportedBudgetMap({ '2026-09': { ...month, id: '2026-08' } }));
  assert.throws(() => parseImportedBudgetMap({ '2026-09': { ...month, entries: [month.entries[0], month.entries[0]] } }));
});
test('versioned backup rejects inconsistent totals', () => {
  const month = createMonthBudget(2026, 9); month.entries[0].amount = 100;
  assert.throws(() => parseBackup({ format: 'finansije-v2', budgetMap: { '2026-09': month }, expenses: [] }));
});
