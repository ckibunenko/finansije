import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createMonthBudget } from '../shared/budget.ts';

const origin = 'https://finansije.test';
const password = 'test-only-' + 'a'.repeat(22);
const passwordHash = 'random-key-sha256:' + createHash('sha256').update(password).digest('hex');
const redirectUri = 'https://chatgpt.com/aip/g-test-finansije/oauth/callback';
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
async function request(path: string, method = 'GET', data?: unknown, cookie = '', extra: Record<string, string> = {}) {
  return mf.dispatchFetch(origin + path, { method,
    headers: { Origin: origin, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...extra },
    body: data === undefined ? undefined : JSON.stringify(data), redirect: 'manual' });
}
async function login() {
  const response = await request('/api/login', 'POST', { password });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
const purchase = (amount = 100) => ({ requestId: crypto.randomUUID(), date: '2026-09-08', amount, description: 'Namirnice' });
async function oauthCode() {
  const params = new URLSearchParams({ response_type: 'code', client_id: 'test-client', redirect_uri: redirectUri, state: 'state-from-chatgpt', scope: 'budget' });
  const page = await request('/oauth/authorize?' + params);
  assert.equal(page.status, 200);
  const csrfCookie = page.headers.get('set-cookie')!.split(';')[0];
  const csrf = (await page.text()).match(/name="csrf" value="([a-f0-9]+)"/)![1];
  params.set('csrf', csrf); params.set('password', password);
  const response = await mf.dispatchFetch(origin + '/oauth/authorize', { method: 'POST', headers: { Origin: origin, Cookie: csrfCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(), redirect: 'manual' });
  assert.equal(response.status, 303);
  const target = new URL(response.headers.get('location')!);
  assert.equal(target.searchParams.get('state'), 'state-from-chatgpt');
  return target.searchParams.get('code')!;
}
async function oauthToken() {
  const response = await request('/oauth/token', 'POST', { grant_type: 'authorization_code', client_id: 'test-client', client_secret: 'test-client-secret', redirect_uri: redirectUri, code: await oauthCode() });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ access_token: string; refresh_token: string }>;
}
before(async () => {
  const bundle = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'finansije', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-08', d1Databases: ['DB'],
    bindings: { PASSWORD_HASH: passwordHash, OAUTH_CLIENT_ID: 'test-client', OAUTH_CLIENT_SECRET: 'test-client-secret', OAUTH_REDIRECT_URIS: redirectUri },
    serviceBindings: { ASSETS: () => new Response('static') },
  }));
  db = await mf.getD1Database('DB');
  const statements = fs.readdirSync('migrations').filter((file) => file.endsWith('.sql')).sort().flatMap((file) => fs.readFileSync('migrations/' + file, 'utf8').match(/\s*CREATE TRIGGER[^]*?END;|[^;]+;/g) ?? []).map((s) => s.trim()).filter(Boolean);
  await db.batch(statements.map((sql) => db.prepare(sql)));
});
beforeEach(async () => {
  await db.batch(['months', 'expenses', 'sessions', 'oauth_codes', 'oauth_tokens', 'rate_limits', 'imports'].map((table) => db.prepare(`DELETE FROM ${table}`)));
});
after(async () => { await mf?.dispose(); });

test('all financial data requires authentication; session is HttpOnly Secure', async () => {
  assert.equal((await request('/api/state')).status, 401);
  assert.equal((await request('/api/export')).status, 401);
  assert.equal((await request('/api/login', 'POST', { password: 'wrong' })).status, 401);
  const response = await request('/api/login', 'POST', { password });
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/); assert.match(response.headers.get('set-cookie')!, /Secure/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await request('/api/state', 'GET', undefined, response.headers.get('set-cookie')!.split(';')[0])).status, 200);
});
test('cross-origin login and cookie writes are blocked', async () => {
  assert.equal((await request('/api/login', 'POST', { password }, '', { Origin: 'https://evil.test' })).status, 403);
  const cookie = await login();
  assert.equal((await request('/api/expenses', 'POST', purchase(), cookie, { Origin: 'https://evil.test' })).status, 403);
});
test('two sessions add to the same day; retry and simultaneous duplicate are idempotent', async () => {
  const a = await login(), b = await login();
  const first = purchase(1500), second = purchase(700);
  const responses = await Promise.all([request('/api/expenses', 'POST', first, a), request('/api/expenses', 'POST', second, b), request('/api/expenses', 'POST', first, a)]);
  assert.ok(responses.every((r) => [200, 201].includes(r.status)));
  const summary = await (await request('/api/summary?month=2026-09', 'GET', undefined, b)).json() as any;
  assert.equal(summary.totalSpent, 2200); assert.equal(summary.days[0].purchases, 2);
  assert.equal((await request('/api/expenses', 'POST', { ...first, amount: 999 }, a)).status, 409);
});
test('zero is tracked, whole dinars are exact, paras and invalid dates are rejected', async () => {
  const cookie = await login();
  for (const amount of [0, 100, 200]) assert.equal((await request('/api/expenses', 'POST', purchase(amount), cookie)).status, 201);
  const state = await (await request('/api/state', 'GET', undefined, cookie)).json() as any;
  assert.equal(state.budgetMap['2026-09'].entries[7].amount, 300);
  for (const data of [{ ...purchase(), date: '2026-09-31' }, purchase(-1), purchase(0.5), purchase(123.45), purchase(Infinity)]) assert.equal((await request('/api/expenses', 'POST', data, cookie)).status, 400);
});
test('optimistic edit prevents stale overwrite; deleted purchases are not revived by retries', async () => {
  const cookie = await login(), payload = purchase();
  await request('/api/expenses', 'POST', payload, cookie);
  const update = { date: payload.date, amount: 200, description: 'Izmena', version: 1 };
  assert.equal((await request(`/api/expenses/${payload.requestId}`, 'PATCH', update, cookie)).status, 200);
  assert.equal((await request(`/api/expenses/${payload.requestId}`, 'PATCH', { ...update, amount: 300 }, cookie)).status, 409);
  assert.equal((await request(`/api/expenses/${payload.requestId}`, 'DELETE', { version: 2 }, cookie)).status, 200);
  const retry = await (await request('/api/expenses', 'POST', payload, cookie)).json() as any;
  assert.equal(retry.deleted, true);
  const state = await (await request('/api/state', 'GET', undefined, cookie)).json() as any;
  assert.equal(state.expenses.length, 0);
});
test('monthly plans reject stale versions and impossible savings goals', async () => {
  const cookie = await login(); const plan = { plannedMonthlyBudget: 10000, monthlySavingsGoal: 2000, version: 0 };
  assert.equal((await request('/api/months/2026-09', 'PUT', plan, cookie)).status, 200);
  assert.equal((await request('/api/months/2026-09', 'PUT', plan, cookie)).status, 409);
  assert.equal((await request('/api/months/2026-09', 'PUT', { ...plan, version: 1, monthlySavingsGoal: 20000 }, cookie)).status, 400);
});
test('legacy import is atomic, repeatable without duplicates, and cannot overwrite existing data', async () => {
  const cookie = await login(), month = createMonthBudget(2026, 9);
  month.entries[0].amount = 0; month.entries[1].amount = 550.5;
  const map = { '2026-09': month };
  assert.equal((await request('/api/import', 'POST', map, cookie)).status, 200);
  assert.equal((await request('/api/import', 'POST', map, cookie)).status, 200);
  const state = await (await request('/api/state', 'GET', undefined, cookie)).json() as any;
  assert.equal(state.expenses.length, 2); assert.equal(state.budgetMap['2026-09'].entries[0].amount, 0);
  assert.equal(state.budgetMap['2026-09'].entries[1].amount, 551);
  month.entries[1].amount = 999;
  assert.equal((await request('/api/import', 'POST', map, cookie)).status, 409);
});
test('invalid import leaves the database empty; v2 backup round-trips purchases', async () => {
  const cookie = await login(); const month = createMonthBudget(2026, 9);
  assert.equal((await request('/api/import', 'POST', { '2026-09': { ...month, entries: [{ date: '2026-09-31', amount: 500 }] } }, cookie)).status, 400);
  await request('/api/expenses', 'POST', purchase(12345), cookie);
  const backup = await (await request('/api/export', 'GET', undefined, cookie)).json();
  await db.batch([db.prepare('DELETE FROM expenses'), db.prepare('DELETE FROM months')]);
  assert.equal((await request('/api/import', 'POST', backup, cookie)).status, 200);
  const restored = await (await request('/api/state', 'GET', undefined, cookie)).json() as any;
  assert.equal(restored.expenses[0].amount, 12345);
});
test('OAuth enforces redirect allowlist, state and CSRF', async () => {
  assert.equal((await request('/oauth/authorize?client_id=test-client&response_type=code&redirect_uri=https://evil.test&state=test')).status, 400);
  const params = new URLSearchParams({ client_id: 'test-client', response_type: 'code', redirect_uri: redirectUri, state: 'test', password });
  const response = await mf.dispatchFetch(origin + '/oauth/authorize', { method: 'POST', headers: { Origin: origin }, body: params.toString() });
  assert.equal(response.status, 403);
});
test('the consent form is accepted without a stated origin and still refuses a foreign one', async () => {
  const params = new URLSearchParams({ response_type: 'code', client_id: 'test-client', redirect_uri: redirectUri, state: 'state-from-chatgpt', scope: 'budget' });
  const page = await request('/oauth/authorize?' + params);
  // Under the site-wide no-referrer policy a browser posts `Origin: null` from this form and the screen 403s.
  assert.equal(page.headers.get('referrer-policy'), 'same-origin');
  // The form ends in a redirect to ChatGPT; with form-action 'self' the browser blocks the post outright.
  assert.match(page.headers.get('content-security-policy')!, /form-action 'self' https:\/\/chatgpt\.com https:\/\/chat\.openai\.com$/);
  assert.match((await request('/api/health')).headers.get('content-security-policy')!, /form-action 'self'$/);
  const csrfCookie = page.headers.get('set-cookie')!.split(';')[0];
  params.set('csrf', (await page.text()).match(/name="csrf" value="([a-f0-9]+)"/)![1]);
  params.set('password', password);
  const post = (headers: Record<string, string>) => mf.dispatchFetch(origin + '/oauth/authorize', { method: 'POST', redirect: 'manual',
    headers: { Cookie: csrfCookie, 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: params.toString() });
  assert.equal((await post({ Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post({ Origin: 'null' })).status, 303);
});
test('OAuth codes are single-use and bound to redirect; access is restricted to GPT operations', async () => {
  const code = await oauthCode();
  const payload = { grant_type: 'authorization_code', client_id: 'test-client', client_secret: 'test-client-secret', redirect_uri: redirectUri, code };
  assert.equal((await request('/oauth/token', 'POST', { ...payload, redirect_uri: 'https://evil.test' })).status, 400);
  const tokenResponse = await request('/oauth/token', 'POST', payload);
  assert.equal(tokenResponse.status, 200);
  assert.equal((await request('/oauth/token', 'POST', payload)).status, 400);
  const tokens = await tokenResponse.json() as any;
  const headers = { Authorization: 'Bearer ' + tokens.access_token };
  assert.equal((await request('/api/expenses', 'POST', purchase(), '', headers)).status, 201);
  assert.equal((await request('/api/summary', 'GET', undefined, '', headers)).status, 200);
  assert.equal((await request('/api/export', 'GET', undefined, '', headers)).status, 403);
  assert.equal((await request('/api/months/2026-09', 'PUT', {}, '', headers)).status, 403);
});
test('OAuth refresh rotates credentials; revoke disables access and refresh', async () => {
  const tokens = await oauthToken();
  const payload = { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: 'test-client', client_secret: 'test-client-secret' };
  const refreshed = await request('/oauth/token', 'POST', payload); assert.equal(refreshed.status, 200);
  assert.equal((await request('/oauth/token', 'POST', payload)).status, 400);
  assert.equal((await request('/api/summary', 'GET', undefined, '', { Authorization: 'Bearer ' + tokens.access_token })).status, 401);
  const next = await refreshed.json() as any;
  const cookie = await login();
  await request('/api/disconnect-gpt', 'POST', {}, cookie);
  assert.equal((await request('/api/summary', 'GET', undefined, '', { Authorization: 'Bearer ' + next.access_token })).status, 401);
  assert.equal((await request('/oauth/token', 'POST', { ...payload, refresh_token: next.refresh_token })).status, 400);
});
test('logout invalidates the server session; repeated failed login is limited', async () => {
  const cookie = await login(); await request('/api/logout', 'POST', {}, cookie);
  assert.equal((await request('/api/state', 'GET', undefined, cookie)).status, 401);
  for (let i = 0; i < 9; i++) await request('/api/login', 'POST', { password: 'wrong' });
  assert.equal((await request('/api/login', 'POST', { password: 'wrong' })).status, 429);
});
test('OpenAPI contains only scoped Actions and no secrets', async () => {
  const response = await request('/openapi.json'); const schema = await response.json() as any;
  assert.deepEqual(Object.keys(schema.paths).sort(), ['/api/expenses', '/api/summary']);
  assert.equal(schema.paths['/api/expenses'].post['x-openai-isConsequential'], true);
  assert.ok(!JSON.stringify(schema).includes('test-client-secret'));
});

test('unchanged polling reads only the revision and a mutation advances it', async () => {
  const cookie = await login();
  const state = await (await request('/api/state', 'GET', undefined, cookie)).json() as any;
  const unchanged = await (await request('/api/state?since=' + state.revision, 'GET', undefined, cookie)).json() as any;
  assert.equal(unchanged.unchanged, true); assert.equal(unchanged.expenses, undefined);
  await request('/api/expenses', 'POST', purchase(), cookie);
  const changed = await (await request('/api/state?since=' + state.revision, 'GET', undefined, cookie)).json() as any;
  assert.ok(changed.revision > state.revision); assert.equal(changed.expenses.length, 1);
});
