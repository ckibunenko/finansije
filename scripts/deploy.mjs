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
// No resource creation, plan upgrade, or secret upload is hidden in deploy.
run(npm, ['run', 'build'], process.platform === 'win32');
run(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'finansije', '--remote']);
run(process.execPath, [wrangler, 'deploy']);
