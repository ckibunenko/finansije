import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { chromium } from '@playwright/test';

const password = 'browser-' + 'a'.repeat(24);
const bundle = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
const dist = path.resolve('dist');
const mf = new Miniflare(convertV4MiniflareOptions({
  name: 'browser-test', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-08', d1Databases: ['DB'],
  bindings: { PASSWORD_HASH: 'random-key-sha256:' + createHash('sha256').update(password).digest('hex') },
  serviceBindings: { ASSETS: async (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    let file = path.resolve(dist, '.' + pathname);
    if (!file.startsWith(dist + path.sep) && file !== dist) return new Response('Not found', { status: 404 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.html': 'text/html' }[path.extname(file)] ?? 'application/octet-stream';
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': type } });
  } },
}));
let browser;
let page;
const screenshotDir = '.wrangler/screenshots';
fs.mkdirSync(screenshotDir, { recursive: true });
try {
  const db = await mf.getD1Database('DB');
  const migrations = fs.readdirSync('migrations').filter((file) => file.endsWith('.sql')).sort().flatMap((file) => fs.readFileSync('migrations/' + file, 'utf8').match(/\s*CREATE TRIGGER[^]*?END;|[^;]+;/g) ?? []);
  await db.batch(migrations.map((sql) => db.prepare(sql.trim())));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const url = (await mf.ready).href;
  const a = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await a.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByLabel('Zajednička šifra').fill(password);
  await page.getByRole('button', { name: 'Otvori finansije' }).click();
  await page.getByRole('button', { name: 'Odjavi se' }).waitFor();
  await page.getByLabel('Planirani mesečni budžet').fill('30000');
  await page.getByLabel('Mesečni cilj za štednju').fill('5000');
  await page.getByRole('button', { name: 'Sačuvaj plan', exact: true }).click();
  await page.getByText('Mesečni plan je sačuvan.', { exact: false }).waitFor();
  await page.getByLabel('Nova kupovina (din)').fill('1500,50');
  await page.getByLabel('Opis kupovine (opciono)').fill('Prva kupovina');
  await page.getByRole('button', { name: 'Dodaj kupovinu' }).click();
  await page.getByText('Prva kupovina', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Dodaj kupovinu' }).isDisabled(), true);
  await page.getByLabel('Nova kupovina (din)').press('Enter');
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM expenses WHERE deleted_at IS NULL').first()).count, 1);

  const b = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await b.newPage();
  phone.on('pageerror', (error) => errors.push(error.message));
  await phone.goto(url); await phone.getByLabel('Zajednička šifra').fill(password); await phone.getByRole('button', { name: 'Otvori finansije' }).click();
  await phone.getByText('Prva kupovina', { exact: true }).waitFor();
  await phone.getByLabel('Nova kupovina (din)').fill('700');
  await phone.getByLabel('Opis kupovine (opciono)').fill('Suprugina kupovina');
  await phone.getByRole('button', { name: 'Dodaj kupovinu' }).click();
  await phone.getByText('Suprugina kupovina', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Osveži', exact: true }).click();
  await page.getByText('Suprugina kupovina', { exact: true }).waitFor();
  assert.equal((await db.prepare('SELECT SUM(amount) AS total FROM expenses WHERE deleted_at IS NULL').first()).total, 220050);

  await page.getByRole('button', { name: 'Izmeni', exact: true }).first().click();
  await page.getByLabel('Iznos', { exact: true }).fill('1600,50');
  await page.getByRole('button', { name: 'Sačuvaj izmenu' }).click();
  await page.getByText('Kupovina je izmenjena.', { exact: false }).waitFor();
  assert.equal((await db.prepare('SELECT SUM(amount) AS total FROM expenses WHERE deleted_at IS NULL').first()).total, 230050);

  // Server commits successfully but the client loses the response: retry must not add twice.
  await page.getByLabel('Nova kupovina (din)').fill('300');
  await page.getByLabel('Opis kupovine (opciono)').fill('Prekid veze');
  await page.route('**/api/expenses', async (route) => { await route.fetch(); await route.abort('failed'); });
  await page.getByRole('button', { name: 'Dodaj kupovinu' }).click();
  await page.getByText('Nema potvrde sa servera.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('Nova kupovina (din)').inputValue(), '300');
  await page.unroute('**/api/expenses');
  await page.getByRole('button', { name: 'Dodaj kupovinu' }).click();
  await page.getByText('Prekid veze', { exact: true }).waitFor();
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM expenses WHERE description='Prekid veze'").first()).count, 1);

  await page.getByRole('button', { name: 'Obriši', exact: true }).last().click();
  await page.getByRole('button', { name: 'Potvrdi brisanje', exact: true }).click();
  await page.getByText('Kupovina je obrisana.', { exact: false }).waitFor();
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM expenses WHERE deleted_at IS NULL').first()).count, 2);

  await page.screenshot({ path: screenshotDir + '/desktop.png', fullPage: true });
  await phone.getByRole('button', { name: 'Osveži', exact: true }).click();
  await phone.screenshot({ path: screenshotDir + '/phone.png', fullPage: true });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > 390);
  assert.equal(overflow, false, 'No horizontal page overflow on a phone');
  await phone.getByRole('button', { name: 'Dark mod' }).click();
  await phone.screenshot({ path: screenshotDir + '/phone-dark.png', fullPage: true });

  // Import preview and localStorage preservation on an empty, separate test database.
  await db.batch(['expenses', 'months', 'imports'].map((table) => db.prepare(`DELETE FROM ${table}`)));
  await page.getByRole('button', { name: 'Osveži', exact: true }).click();
  await page.getByText('Imate staru evidenciju?', { exact: false }).waitFor();
  const legacy = { '2026-09': { id: '2026-09', year: 2026, month: 9, plannedMonthlyBudget: 10000, monthlySavingsGoal: 0, entries: [{ date: '2026-09-01', amount: 555 }] } };
  await page.evaluate((value) => localStorage.setItem('finansije-prodavnica-v1', JSON.stringify(value)), legacy);
  await page.getByRole('button', { name: 'Proveri stare podatke u ovom browseru' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Potvrdi uvoz' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal((await db.prepare('SELECT SUM(amount) AS total FROM expenses').first()).total, 55500);
  assert.ok(await page.evaluate(() => localStorage.getItem('finansije-prodavnica-v1')));
  await page.getByRole('button', { name: 'Odjavi se' }).click();
  await page.getByRole('button', { name: 'Otvori finansije' }).waitFor();
  await page.screenshot({ path: screenshotDir + '/login.png' });
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: login, two devices, monthly plan, add/edit/delete, empty submit, lost response/retry, import, local backup, mobile layout, dark mode, logout.');
} catch (error) {
  if (page) await page.screenshot({ path: screenshotDir + '/failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally { await browser?.close(); await mf.dispose(); }
