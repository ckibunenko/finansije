import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { passwordHash } from './password.mjs';
const path = new URL('../.dev.vars', import.meta.url);
if (fs.existsSync(path)) {
  console.log('.dev.vars već postoji; postojeća lokalna podešavanja nisu promenjena.');
} else {
  fs.writeFileSync(path, [
    `PASSWORD_HASH="${passwordHash('lokalna-provera-finansije-123456')}"`,
    'OAUTH_CLIENT_ID="finansije-local"',
    `OAUTH_CLIENT_SECRET="${randomBytes(32).toString('hex')}"`,
    'OAUTH_REDIRECT_URIS="https://chatgpt.com/aip/g-local-test/oauth/callback"',
  ].join('\n') + '\n', { flag: 'wx' });
  console.log('Lokalna test šifra: lokalna-provera-finansije-123456. Namenjena je samo lokalnoj proveri.');
}
