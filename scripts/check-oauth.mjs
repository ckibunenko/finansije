// Prolazi kroz ceo OAuth tok isto kao ChatGPT Actions, na objavljenoj adresi.
// Ne upisuje troskove i ne ispisuje sifru, client secret ni tokene.
// Koriscenje: node scripts/check-oauth.mjs [adresa] [g-id]
import { readFileSync } from 'node:fs';

const secrets = JSON.parse(readFileSync(new URL('../secrets.local.json', import.meta.url), 'utf8'));
const password = readFileSync(new URL('../.env.access.txt', import.meta.url), 'utf8')
  .split(/\r?\n/).map((line) => line.trim()).find((line) => /^[A-Za-z0-9_-]{32}$/.test(line));
if (!password) throw new Error('Zajednicka sifra nije pronadjena u .env.access.txt');

const base = (process.argv[2] ?? 'https://nase-finansije.finansije-prodavnica.workers.dev').replace(/\/$/, '');
const gpt = process.argv[3] ?? new URL(secrets.OAUTH_REDIRECT_URIS.split(',')[0].trim()).pathname.split('/')[2];
const redirectUri = `https://chatgpt.com/aip/${gpt}/oauth/callback`;
const state = 'proba-' + crypto.randomUUID();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures++;
  console.log(`${passed ? 'OK  ' : 'PAD '} ${label}${detail ? '  — ' + detail : ''}`);
};
const form = (fields) => new URLSearchParams(fields).toString();
const post = (path, fields, headers = {}) => fetch(base + path, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
  body: typeof fields === 'string' ? fields : form(fields),
});

console.log(`Adresa: ${base}\nGPT: ${gpt}\n`);

// 1. Stranica za potvrdu — isto sto korisnik vidi kad ChatGPT trazi povezivanje.
const authQuery = form({ client_id: secrets.OAUTH_CLIENT_ID, response_type: 'code', scope: 'budget', state, redirect_uri: redirectUri });
const consent = await fetch(`${base}/oauth/authorize?${authQuery}`);
check('stranica za potvrdu se otvara', consent.status === 200, `HTTP ${consent.status}`);
const csrfCookie = (consent.headers.getSetCookie?.() ?? []).find((c) => c.includes('oauth_csrf'));
const csrf = csrfCookie?.match(/oauth_csrf=([^;]+)/)?.[1] ?? '';
check('CSRF kolacic je postavljen', Boolean(csrf));
check('stranica dozvoljava browseru da navede Origin', consent.headers.get('Referrer-Policy') === 'same-origin', consent.headers.get('Referrer-Policy') ?? 'nema');
const cookieHeader = csrfCookie ? csrfCookie.split(';')[0] : '';

// 2. Pogresna sifra ne sme da izda kod.
const wrong = await post('/oauth/authorize',
  { client_id: secrets.OAUTH_CLIENT_ID, response_type: 'code', scope: 'budget', state, redirect_uri: redirectUri, csrf, password: 'x'.repeat(32) },
  { Origin: base, Cookie: cookieHeader });
check('pogresna sifra je odbijena', wrong.status === 401, `HTTP ${wrong.status}`);

// 3. Tudji Origin ne sme da prodje ni sa ispravnom sifrom.
const foreign = await post('/oauth/authorize',
  { client_id: secrets.OAUTH_CLIENT_ID, response_type: 'code', scope: 'budget', state, redirect_uri: redirectUri, csrf, password },
  { Origin: 'https://zlonamerni.test', Cookie: cookieHeader });
check('tudji Origin je odbijen', foreign.status === 403, `HTTP ${foreign.status}`);

// 4. Ispravna sifra -> kod u redirectu. Origin: null je ono sto browser stvarno posalje sa ove forme.
const granted = await post('/oauth/authorize',
  { client_id: secrets.OAUTH_CLIENT_ID, response_type: 'code', scope: 'budget', state, redirect_uri: redirectUri, csrf, password },
  { Origin: 'null', Cookie: cookieHeader });
const location = granted.headers.get('Location') ?? '';
const returned = new URL(location || 'https://x.invalid');
const code = returned.searchParams.get('code') ?? '';
check('potvrda vraca kod na ChatGPT callback', granted.status === 303 && returned.origin === 'https://chatgpt.com' && Boolean(code), `HTTP ${granted.status}`);
check('state je vracen nepromenjen', returned.searchParams.get('state') === state);

// 4. Razmena koda za token (client secret u telu, kako ChatGPT salje).
const tokenResponse = await post('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: secrets.OAUTH_CLIENT_ID, client_secret: secrets.OAUTH_CLIENT_SECRET });
const tokens = await tokenResponse.json().catch(() => ({}));
check('kod je razmenjen za token', tokenResponse.status === 200 && Boolean(tokens.access_token), `HTTP ${tokenResponse.status}`);
check('token je Bearer, sat vremena, scope budget', tokens.token_type === 'Bearer' && tokens.expires_in === 3600 && tokens.scope === 'budget');

// 5. Isti kod ne sme da prodje drugi put.
const replay = await post('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: secrets.OAUTH_CLIENT_ID, client_secret: secrets.OAUTH_CLIENT_SECRET });
check('iskorisceni kod je odbijen', replay.status === 400, `HTTP ${replay.status}`);

// 6. Pogresan client secret.
const badSecret = await post('/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: secrets.OAUTH_CLIENT_ID, client_secret: 'pogresno' });
check('pogresan client secret je odbijen', badSecret.status === 401, `HTTP ${badSecret.status}`);

const bearer = { Authorization: `Bearer ${tokens.access_token}` };

// 7. Ono zbog cega sve ovo postoji: GPT cita mesecni pregled.
const summaryResponse = await fetch(`${base}/api/summary`, { headers: bearer });
const summary = await summaryResponse.json().catch(() => ({}));
check('GPT moze da procita mesecni pregled', summaryResponse.status === 200 && typeof summary.totalSpent === 'number', `HTTP ${summaryResponse.status}`);
if (summaryResponse.status === 200) {
  console.log(`     ${summary.month}: potroseno ${summary.totalSpent} od ${summary.budget} RSD, ${summary.days.length} dana sa unosima`);
}

// 8. GPT ne sme nista osim pregleda i unosa.
for (const [label, path] of [['izvoz cele istorije', '/api/export'], ['pun snimak stanja', '/api/state']]) {
  const blocked = await fetch(base + path, { headers: bearer });
  check(`GPT-ju je zabranjen ${label}`, blocked.status === 403, `HTTP ${blocked.status}`);
}

// 9. Obnavljanje tokena sa rotacijom — ChatGPT ovo radi svakog sata.
const refreshed = await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, { Authorization: 'Basic ' + Buffer.from(`${secrets.OAUTH_CLIENT_ID}:${secrets.OAUTH_CLIENT_SECRET}`).toString('base64') });
const fresh = await refreshed.json().catch(() => ({}));
check('token se obnavlja (HTTP Basic autentikacija)', refreshed.status === 200 && Boolean(fresh.access_token), `HTTP ${refreshed.status}`);
check('obnavljanje daje nov refresh token', fresh.refresh_token !== tokens.refresh_token);

const reused = await post('/oauth/token', { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: secrets.OAUTH_CLIENT_ID, client_secret: secrets.OAUTH_CLIENT_SECRET });
check('stari refresh token vise ne radi', reused.status === 400, `HTTP ${reused.status}`);

console.log(`\n${failures ? failures + ' provera nije prosla.' : 'Sve provere su prosle. OAuth na serveru radi.'}`);
console.log('Napomena: test je napravio jednu GPT vezu. Obrisite je dugmetom „Opozovi GPT pristup" u aplikaciji.');
process.exit(failures ? 1 : 0);
