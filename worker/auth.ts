import { CSP, HttpError, body, escapeHtml, formOrigin, json, readText, sameOrigin } from './http.ts';
import type { Env } from './http.ts';

const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export function constantEqual(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
export async function passwordMatches(password: unknown, env: Env) {
  if (!env.PASSWORD_HASH) throw new HttpError(503, 'Prijava još nije podešena.');
  if (typeof password !== 'string' || !/^[a-zA-Z0-9_-]{32}$/.test(password)) return false;
  const [version, expected] = env.PASSWORD_HASH.split(':');
  if (version !== 'random-key-sha256' || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new HttpError(503, 'Prijava još nije ispravno podešena.');
  }
  // This is a generated 192-bit access key, NOT a human-chosen password.
  // Hash verification stays within the Workers Free CPU budget; entropy provides
  // offline-guessing resistance. setup-secrets never accepts a weak custom key.
  return constantEqual(await hash(password), expected);
}
export const passwordVersion = (env: Env) => hash(env.PASSWORD_HASH ?? 'not-configured');
export function cookie(request: Request, name: string) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}
export const sessionName = (request: Request) => new URL(request.url).protocol === 'https:' ? '__Host-finansije' : 'finansije_dev';
function setCookie(request: Request, name: string, value: string, age: number, path = '/') {
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function rateLimit(request: Request, env: Env, group: string, limit = 10, seconds = 900) {
  // CF-Connecting-IP is supplied by Cloudflare, never trust forwarded-for from clients.
  const identity = await hash(request.headers.get('CF-Connecting-IP') ?? 'local');
  const key = `${group}:${identity}:${Math.floor(now() / seconds)}`;
  const row = await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count')
    .bind(key, now() + seconds).first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, 'Previše pokušaja. Sačekajte malo pa pokušajte ponovo.');
}
export async function webSession(request: Request, env: Env) {
  const token = cookie(request, sessionName(request));
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return !!await env.DB.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>? AND password_version=?')
    .bind(await hash(token), now(), await passwordVersion(env)).first();
}
export const DEVICE_TOKEN_AGE = 365 * 86400;
export async function authenticate(request: Request, env: Env): Promise<'web' | 'gpt' | 'shortcut'> {
  if (!env.PASSWORD_HASH) throw new HttpError(503, 'Prijava još nije podešena.');
  const auth = request.headers.get('Authorization');
  if (auth) {
    const token = auth.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (token) {
      const [tokenHash, version] = [await hash(token), await passwordVersion(env)];
      if (await env.DB.prepare('SELECT 1 FROM oauth_tokens WHERE access_hash=? AND access_expires>? AND refresh_expires>? AND password_version=?')
        .bind(tokenHash, now(), now(), version).first()) return 'gpt';
      // The phone shortcut carries the same shape of bearer token and inherits the
      // same restrictions: only the monthly summary and adding a purchase.
      if (await env.DB.prepare('SELECT 1 FROM device_tokens WHERE token_hash=? AND expires_at>? AND password_version=?')
        .bind(tokenHash, now(), version).first()) return 'shortcut';
    }
    throw new HttpError(401, 'Povežite ponovo GPT ili prečicu sa finansijama.');
  }
  if (!await webSession(request, env)) throw new HttpError(401, 'Prijavite se zajedničkom šifrom.');
  if (!['GET', 'HEAD'].includes(request.method)) sameOrigin(request);
  return 'web';
}
export async function login(request: Request, env: Env) {
  sameOrigin(request);
  await rateLimit(request, env, 'login');
  const input = await body(request);
  if (!await passwordMatches(input.password, env)) throw new HttpError(401, 'Pogrešna šifra.');
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await hash(token), await passwordVersion(env), now() + 30 * 86400).run();
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(request, sessionName(request), token, 30 * 86400) });
}
export async function logout(request: Request, env: Env) {
  sameOrigin(request);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(cookie(request, sessionName(request)))).run();
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(request, sessionName(request), '', 0) });
}

export async function createDeviceToken(env: Env, label: unknown) {
  const name = typeof label === 'string' && label.trim() ? label.trim().slice(0, 40) : 'Telefon';
  const token = randomToken();
  await env.DB.prepare('INSERT INTO device_tokens(id,token_hash,label,password_version,created_at,expires_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), await hash(token), name, await passwordVersion(env), new Date().toISOString(), now() + DEVICE_TOKEN_AGE).run();
  // The plain token is returned once and never stored; only its hash is kept.
  return json({ ok: true, token, label: name, expiresInDays: DEVICE_TOKEN_AGE / 86400 });
}
export async function revokeDeviceTokens(env: Env) {
  await env.DB.prepare('DELETE FROM device_tokens').run();
  return json({ ok: true });
}
export async function countDeviceTokens(env: Env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM device_tokens WHERE expires_at>? AND password_version=?')
    .bind(now(), await passwordVersion(env)).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

function oauthConfig(env: Env) {
  if (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET || !env.OAUTH_REDIRECT_URIS) throw new HttpError(503, 'GPT povezivanje još nije podešeno. Web aplikacija može da se koristi.');
}
function validateAuthorization(params: URLSearchParams, env: Env) {
  oauthConfig(env);
  const redirect = params.get('redirect_uri') ?? '';
  const state = params.get('state') ?? '';
  const allowed = env.OAUTH_REDIRECT_URIS!.split(',').map((s) => s.trim());
  if (params.get('client_id') !== env.OAUTH_CLIENT_ID || params.get('response_type') !== 'code' ||
      !allowed.includes(redirect) || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\/aip\/g-[a-zA-Z0-9_-]+\/oauth\/callback$/.test(redirect) ||
      state.length < 1 || state.length > 1024 || (params.get('scope') ?? 'budget') !== 'budget') {
    throw new HttpError(400, 'Neispravan zahtev za povezivanje GPT-ja.');
  }
  // Unsupported PKCE is rejected rather than silently discarded.
  if (params.has('code_challenge')) throw new HttpError(400, 'Koristite GPT Actions OAuth sa client secret autentikacijom.');
  return { redirect, state };
}
export async function authorize(request: Request, env: Env) {
  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    validateAuthorization(params, env);
    const csrf = randomToken();
    const fields = ['client_id', 'response_type', 'redirect_uri', 'state', 'scope'].map((key) =>
      `<input type="hidden" name="${key}" value="${escapeHtml(params.get(key) ?? (key === 'scope' ? 'budget' : ''))}">`).join('');
    return new Response(`<!doctype html><html lang="sr-Latn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Poveži Naše finansije</title><link rel="stylesheet" href="/auth.css"><main><p class="eyebrow">NAŠE FINANSIJE</p><h1>Poveži sa ChatGPT-jem</h1><p>GPT će moći da pročita vaš budžet i kupovine i doda nove troškove. Neće moći da briše troškove ili menja plan.</p><form method="post" action="/oauth/authorize">${fields}<input type="hidden" name="csrf" value="${csrf}"><label>Zajednička šifra<input type="password" name="password" required maxlength="256" autocomplete="current-password"></label><button>Poveži finansije</button></form><a href="/">Odustani i otvori aplikaciju</a></main></html>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin',
        // Browsers apply form-action to the redirect this form ends in, so the ChatGPT callback has to be named here.
        'Content-Security-Policy': CSP + "'self' https://chatgpt.com https://chat.openai.com",
        'Set-Cookie': setCookie(request, 'oauth_csrf', csrf, 600, '/oauth') },
    });
  }
  formOrigin(request);
  const params = new URLSearchParams(await readText(request, 8192));
  const { redirect, state } = validateAuthorization(params, env);
  const csrf = params.get('csrf') ?? '';
  if (!csrf || !constantEqual(csrf, cookie(request, 'oauth_csrf'))) throw new HttpError(403, 'Ponovo otvorite povezivanje iz ChatGPT-ja.');
  await rateLimit(request, env, 'login');
  if (!await passwordMatches(params.get('password'), env)) {
    const back = new URL('/oauth/authorize', request.url);
    for (const key of ['client_id', 'response_type', 'redirect_uri', 'state', 'scope']) back.searchParams.set(key, params.get(key) ?? '');
    return new Response(`<!doctype html><html lang="sr-Latn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/auth.css"><main><h1>Pogrešna šifra</h1><p>Finansije nisu povezane sa ChatGPT-jem.</p><a href="${escapeHtml(back.pathname + back.search)}">Pokušaj ponovo</a></main></html>`, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const code = randomToken();
  await env.DB.prepare('INSERT INTO oauth_codes VALUES (?,?,?,?)').bind(await hash(code), redirect, await passwordVersion(env), now() + 120).run();
  const target = new URL(redirect);
  target.searchParams.set('code', code); target.searchParams.set('state', state);
  return new Response(null, { status: 303, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Set-Cookie': setCookie(request, 'oauth_csrf', '', 0, '/oauth') } });
}
export async function token(request: Request, env: Env) {
  oauthConfig(env);
  await rateLimit(request, env, 'token', 60, 60);
  const raw = await readText(request, 8192);
  let input: Record<string, unknown>;
  try {
    input = request.headers.get('Content-Type')?.startsWith('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch { throw new HttpError(400, 'Neispravan OAuth zahtev.'); }
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Neispravan OAuth zahtev.');
  let clientId = input.client_id, secret = input.client_secret;
  const basic = request.headers.get('Authorization')?.match(/^Basic (.+)$/)?.[1];
  if (basic) {
    try { const decoded = atob(basic); const index = decoded.indexOf(':'); clientId = decodeURIComponent(decoded.slice(0, index)); secret = decodeURIComponent(decoded.slice(index + 1)); }
    catch { throw new HttpError(401, 'invalid_client'); }
  }
  if (clientId !== env.OAUTH_CLIENT_ID || typeof secret !== 'string' || !constantEqual(secret, env.OAUTH_CLIENT_SECRET!)) throw new HttpError(401, 'invalid_client');
  const access = randomToken(), refresh = randomToken();
  const version = await passwordVersion(env);
  if (input.grant_type === 'authorization_code') {
    if (typeof input.code !== 'string' || typeof input.redirect_uri !== 'string') throw new HttpError(400, 'invalid_grant');
    const codeHash = await hash(input.code);
    const [created] = await env.DB.batch([
      env.DB.prepare('INSERT INTO oauth_tokens(id,access_hash,refresh_hash,password_version,access_expires,refresh_expires) SELECT ?,?,?,password_version,?,? FROM oauth_codes WHERE code_hash=? AND redirect_uri=? AND expires_at>? AND password_version=? RETURNING id')
        .bind(crypto.randomUUID(), await hash(access), await hash(refresh), now() + 3600, now() + 90 * 86400, codeHash, input.redirect_uri, now(), version),
      env.DB.prepare('DELETE FROM oauth_codes WHERE code_hash=? AND redirect_uri=? AND expires_at>? AND password_version=?').bind(codeHash, input.redirect_uri, now(), version),
    ]);
    if (!created.results.length) throw new HttpError(400, 'invalid_grant');
  } else if (input.grant_type === 'refresh_token') {
    if (typeof input.refresh_token !== 'string') throw new HttpError(400, 'invalid_grant');
    const updated = await env.DB.prepare('UPDATE oauth_tokens SET access_hash=?, refresh_hash=?, access_expires=? WHERE refresh_hash=? AND refresh_expires>? AND password_version=? RETURNING id')
      .bind(await hash(access), await hash(refresh), now() + 3600, await hash(input.refresh_token), now(), version).first();
    if (!updated) throw new HttpError(400, 'invalid_grant');
  } else throw new HttpError(400, 'unsupported_grant_type');
  return json({ access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600, scope: 'budget' });
}
export async function cleanup(env: Env) {
  const version = await passwordVersion(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<? OR password_version<>?').bind(now(), version),
    env.DB.prepare('DELETE FROM oauth_codes WHERE expires_at<? OR password_version<>?').bind(now(), version),
    env.DB.prepare('DELETE FROM oauth_tokens WHERE refresh_expires<? OR password_version<>?').bind(now(), version),
    env.DB.prepare('DELETE FROM device_tokens WHERE expires_at<? OR password_version<>?').bind(now(), version),
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now()),
  ]);
}
