export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PASSWORD_HASH?: string;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_URIS?: string;
}
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra,
  } });
}
export async function readText(request: Request, maxBytes = 1_000_000) {
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) throw new HttpError(413, 'Fajl je prevelik.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Fajl je prevelik.'); }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}
export async function body(request: Request, limit = 16_384): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, 'Očekivan je JSON.');
  try {
    const value = JSON.parse(await readText(request, limit));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Neispravan JSON.');
  }
}
export function sameOrigin(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new HttpError(403, 'Zahtev nije poslat iz aplikacije.');
}
// A plain HTML form sends `Origin: null` whenever the page it sits on carries Referrer-Policy: no-referrer,
// so the consent form cannot use the strict check above. A stated origin still has to match; a withheld one
// leaves the CSRF token, whose cookie is SameSite=Lax and therefore absent on any cross-site post.
export function formOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null' && origin !== new URL(request.url).origin) throw new HttpError(403, 'Zahtev nije poslat iz aplikacije.');
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action ";
export function secure(response: Response) {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  // The consent page opts into `same-origin` so its form still states an Origin; everything else stays silent.
  if (!result.headers.has('Referrer-Policy')) result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  // The consent page widens form-action to the ChatGPT callback; every other response keeps 'self'.
  if (!result.headers.has('Content-Security-Policy')) result.headers.set('Content-Security-Policy', CSP + "'self'");
  return result;
}
