import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const config = JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
if (config.d1_databases[0].database_id === '00000000-0000-0000-0000-000000000000') {
  throw new Error('Prvo napravite Cloudflare D1 bazu i unesite njen database_id u wrangler.jsonc. Pogledajte DEPLOYMENT.md.');
}
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, shell = false) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// The Cloudflare D1 API intermittently answers 7403 ("account not authorized") on a request
// that succeeds moments later. Both steps below are safe to repeat: applied migrations are
// recorded in d1_migrations and are not run twice, and an upload of the same build is a no-op.
// A failure that is not transient still stops the deploy, on the last attempt.
function runWithRetry(args, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const result = spawnSync(process.execPath, [wrangler, ...args], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status === 0) return;
    if (attempt >= attempts) process.exit(result.status ?? 1);
    console.error(`
Cloudflare je odbio zahtev (pokušaj ${attempt}/${attempts}). Ponavljam za 5 sekundi…
`);
    sleep(5000);
  }
}
// No resource creation, plan upgrade, or secret upload is hidden in deploy.
run(npm, ['run', 'build'], process.platform === 'win32');
runWithRetry(['d1', 'migrations', 'apply', 'finansije', '--remote']);
runWithRetry(['deploy']);
