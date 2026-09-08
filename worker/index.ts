import { authenticate, authorize, cleanup, login, logout, token } from './auth.ts';
import { addExpense, editExpense, getState, importBackup, summary, updateMonth } from './data.ts';
import { belgradeToday } from '../shared/budget.ts';
import { HttpError, json, secure } from './http.ts';
import type { Env } from './http.ts';
import { openApi } from './openapi.ts';

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (method === 'GET' && path === '/api/health') return json({ ok: true, service: 'finansije' });
  if (method === 'GET' && path === '/openapi.json') return json(openApi(url.origin));
  if (method === 'POST' && path === '/api/login') return login(request, env);
  if (method === 'POST' && path === '/api/logout') return logout(request, env);
  if (['GET', 'POST'].includes(method) && path === '/oauth/authorize') return authorize(request, env);
  if (method === 'POST' && path === '/oauth/token') return token(request, env);
  if (path.startsWith('/api/')) {
    const caller = await authenticate(request, env);
    if (method === 'GET' && path === '/api/summary') return summary(env, url.searchParams.get('month') ?? belgradeToday().slice(0, 7));
    if (method === 'POST' && path === '/api/expenses') return addExpense(request, env, caller);
    // The GPT token cannot change plans, export all history, restore, edit, or delete.
    if (caller !== 'web') throw new HttpError(403, 'Ova radnja je dostupna samo u web aplikaciji.');
    if (method === 'GET' && path === '/api/state') {
      const since = url.searchParams.get('since');
      if (since && /^\d+$/.test(since)) {
        const revision = await env.DB.prepare('SELECT version FROM state_revision WHERE id=1').first<{ version: number }>();
        if (revision && revision.version === Number(since)) return json({ unchanged: true, today: belgradeToday() });
      }
      return json(await getState(env));
    }
    if (method === 'GET' && path === '/api/export') {
      const state = await getState(env);
      return json({ format: 'finansije-v2', exportedAt: new Date().toISOString(), ...state }, 200, {
        'Content-Disposition': `attachment; filename="finansije-${state.today}.json"`,
      });
    }
    if (method === 'POST' && path === '/api/import') return importBackup(request, env);
    if (method === 'POST' && path === '/api/disconnect-gpt') { await env.DB.batch([env.DB.prepare('DELETE FROM oauth_codes'), env.DB.prepare('DELETE FROM oauth_tokens')]); return json({ ok: true }); }
    const purchase = path.match(/^\/api\/expenses\/([^/]+)$/);
    if (purchase && ['PATCH', 'DELETE'].includes(method)) return editExpense(request, env, purchase[1]);
    const month = path.match(/^\/api\/months\/([^/]+)$/);
    if (month && method === 'PUT') return updateMonth(request, env, month[1]);
    throw new HttpError(404, 'Tražena radnja ne postoji.');
  }
  if (path.startsWith('/oauth/')) throw new HttpError(404, 'Tražena radnja ne postoji.');
  if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Metod nije dozvoljen.');
  // The asset server already serves /privacy from privacy.html and redirects the .html form back to it,
  // so rewriting the path here bounced the two against each other forever.
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return secure(await route(request, env)); }
    catch (error) {
      const known = error instanceof HttpError;
      // Never log request bodies, financial details, tokens, or SQL parameters.
      if (!known) console.error('Request failed', error instanceof Error ? error.name : 'UnknownError');
      const status = known ? error.status : 503;
      return secure(json({ error: known ? error.message : 'Čuvanje ili učitavanje trenutno nije dostupno. Sačuvajte unos i pokušajte ponovo.' }, status,
        status === 429 ? { 'Retry-After': '900' } : {}));
    }
  },
  async scheduled(_event: ScheduledController, env: Env) { await cleanup(env); },
};
