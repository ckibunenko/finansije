import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// The worker suite applies every migration to an empty database at once. This one applies
// them in stages with real rows in between, because 0003 rebuilds `expenses` and the live
// database already holds the imported household history.
const split = (file: string) => (fs.readFileSync('migrations/' + file, 'utf8').match(/\s*CREATE TRIGGER[^]*?END;|[^;]+;/g) ?? []).map((s) => s.trim()).filter(Boolean);
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
const apply = async (file: string) => { for (const sql of split(file)) await db.prepare(sql).run(); };

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'migration', modules: true, script: 'export default { fetch: () => new Response("") }', compatibilityDate: '2026-09-08', d1Databases: ['DB'] }));
  db = await mf.getD1Database('DB');
});
after(async () => { await mf?.dispose(); });

test('0003 rebuilds expenses without losing rows or inflating the revision', async () => {
  await apply('0001_household.sql');
  await apply('0002_revision.sql');

  const rows = [
    ['legacy-2026-01-05-total', '2026-01-05', 45000, 'Prenet dnevni zbir', 'import'],
    ['aaaaaaaaaaaaaaaaaaaa', '2026-09-01', 120050, 'Namirnice', 'web'],
    ['bbbbbbbbbbbbbbbbbbbb', '2026-09-02', 30000, 'Kafa', 'gpt'],
  ];
  for (const [id, date, amount, description, source] of rows) {
    await db.prepare('INSERT INTO expenses(id,date,amount,description,source,created_at,original_payload) VALUES (?,?,?,?,?,?,?)')
      .bind(id, date, amount, description, source, '2026-09-08T10:00:00.000Z', '{}').run();
  }
  await db.prepare('UPDATE expenses SET deleted_at=? WHERE id=?').bind('2026-09-08T11:00:00.000Z', 'bbbbbbbbbbbbbbbbbbbb').run();
  await db.prepare('INSERT INTO months(id,budget,savings) VALUES (?,?,?)').bind('2026-09', 5000000, 1000000).run();

  const before = await db.prepare('SELECT version FROM state_revision WHERE id=1').first<{ version: number }>();
  const snapshot = await db.prepare('SELECT * FROM expenses ORDER BY id').all();

  await apply('0003_device_tokens.sql');

  const restored = await db.prepare('SELECT * FROM expenses ORDER BY id').all();
  assert.deepEqual(restored.results, snapshot.results, 'every column survives the rebuild');
  const revision = await db.prepare('SELECT version FROM state_revision WHERE id=1').first<{ version: number }>();
  assert.equal(revision!.version, before!.version, 'copying rows must not advance the revision');

  // The recreated triggers, index and constraints are live again.
  await db.prepare('INSERT INTO expenses(id,date,amount,description,source,created_at,original_payload) VALUES (?,?,?,?,?,?,?)')
    .bind('cccccccccccccccccccc', '2026-09-09', 50000, 'Prečica', 'shortcut', '2026-09-09T10:00:00.000Z', '{}').run();
  const advanced = await db.prepare('SELECT version FROM state_revision WHERE id=1').first<{ version: number }>();
  assert.equal(advanced!.version, before!.version + 1);
  await assert.rejects(db.prepare('INSERT INTO expenses(id,date,amount,description,source,created_at,original_payload) VALUES (?,?,?,?,?,?,?)')
    .bind('dddddddddddddddddddd', '2026-09-09', 100, '', 'izmisljeno', '2026-09-09T10:00:00.000Z', '{}').run());
  await assert.rejects(db.prepare('INSERT INTO expenses(id,date,amount,description,source,created_at,original_payload) VALUES (?,?,?,?,?,?,?)')
    .bind('cccccccccccccccccccc', '2026-09-09', 100, '', 'web', '2026-09-09T10:00:00.000Z', '{}').run(), 'the primary key still holds');
  const index = await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='expenses_date'").first();
  assert.ok(index, 'expenses_date is recreated');
  const triggers = await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='expenses'").all();
  assert.equal(triggers.results.length, 3);
});
