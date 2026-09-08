import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { passwordHash } from './password.mjs';
const output = new URL('../secrets.local.json', import.meta.url);
if (fs.existsSync(output)) throw new Error('secrets.local.json već postoji. Sačuvajte prethodnu kopiju pre namerne rotacije pristupa.');
if (!process.stdin.isTTY) throw new Error('Pokrenite ovu komandu lično u interaktivnom terminalu.');
// A random 192-bit household key allows fast verification on Workers Free.
// Do not replace this with a user-chosen password and a fast unsalted hash.
const password = randomBytes(24).toString('base64url');
fs.writeFileSync(output, JSON.stringify({
  PASSWORD_HASH: passwordHash(password),
  OAUTH_CLIENT_ID: 'nase-finansije',
  OAUTH_CLIENT_SECRET: randomBytes(32).toString('hex'),
}, null, 2), { flag: 'wx', mode: 0o600 });
console.log('Zajednička šifra (sačuvajte u password manager-u; nije upisana u fajl):');
console.log(password);
console.log('Podešavanja su u ignorisanom secrets.local.json. Ne delite taj fajl i ne dodajte ga u Git.');
