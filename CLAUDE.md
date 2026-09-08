# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Naše finansije" — a single-household store-expense tracker for one couple. A React SPA plus a
Cloudflare Worker backed by D1, deployed to `nase-finansije.finansije-prodavnica.workers.dev` on the
Workers **Free** plan. A second client is a ChatGPT custom GPT that talks to the same Worker over
OAuth 2.0 Actions.

All user-facing strings — UI copy, API error messages, docs — are **Serbian (Latin script)**. New
errors and labels must follow. Currency is RSD, timezone `Europe/Belgrade`.

`README.md` is stale: it describes an earlier localStorage-only version. Server D1 data is
authoritative; `localStorage` now holds only the theme preference and the legacy `finansije-prodavnica-v1`
blob offered for one-time import.

## Commands

```bash
npm install
npm run setup:local          # writes .dev.vars with a local test password (first run only)
npm run db:local             # apply migrations to the local D1

npm run dev:api              # Worker on 127.0.0.1:8787  — run this…
npm run dev                  # …and Vite on 5173, which proxies /api /oauth /openapi.json /privacy to 8787

npm run build                # tsc -b && tsc -p tsconfig.worker.json && vite build  (the only typecheck)
npm test                     # node --test over tests/*.test.ts (Miniflare, no network)
npm run test:browser         # Playwright + Miniflare against the built dist/ — run `npm run build` first
npm run deploy               # build → apply remote migrations → wrangler deploy
npm run check:oauth          # replays the full OAuth flow against the live deployment
```

Run one test by name (the runner strips TypeScript types natively):

```bash
node --experimental-strip-types --test --test-name-pattern "OAuth refresh" tests/worker.test.ts
```

There is no linter and no separate typecheck script — `npm run build` is what catches type errors,
and it typechecks the app and the worker under *different* tsconfigs.

## Architecture

**Three TypeScript projects, one shared module.** `tsconfig.app.json` (`src/`, DOM libs),
`tsconfig.worker.json` (`worker/` + `shared/`, `@cloudflare/workers-types`, `allowImportingTsExtensions`),
`tsconfig.node.json` (Vite config). `shared/budget.ts` is the only code both sides compile — the worker
imports it as `'../shared/budget.ts'` (with extension), the browser as `'../../shared/budget'` (without).
Keep it dependency-free and DOM-free.

**Serving.** `wrangler.jsonc` binds `dist/` as `ASSETS` with SPA fallback, and `run_worker_first` for
`/api/*`, `/oauth/*`, `/openapi.json`, `/privacy`. Everything else falls through to `env.ASSETS.fetch`
unmodified — do not rewrite `/privacy` to `/privacy.html`, the asset server redirects it back and the two
loop forever (this was a real production bug).

**Request flow.** `worker/index.ts` is a flat if-chain router; `worker/http.ts` holds `HttpError`, `json`,
body-size-limited readers, CSRF origin checks, and `secure()` which stamps CSP/HSTS/etc on every response.
Throwing `HttpError` is the only way to return a non-200; unknown errors become a 503 with a generic
Serbian message and are logged by error *name* only — never log bodies, amounts, tokens, or SQL params.

**Two caller identities.** `authenticate()` returns `'web'` (HttpOnly `__Host-` session cookie) or `'gpt'`
(OAuth bearer). The GPT identity may only call `GET /api/summary` and `POST /api/expenses`; the router
403s it out of everything else with one guard. Keep new destructive routes behind that guard.

**Password rotation as global revocation.** `sessions`, `oauth_codes`, and `oauth_tokens` each store a
`password_version` (a hash of `PASSWORD_HASH`). Changing the secret invalidates every session and token
implicitly. The nightly cron (`scheduled` → `cleanup`) sweeps expired and stale-version rows.

**Money is whole dinars.** Paras do not exist anywhere: `amount INTEGER` counts dinars, `toDinars()` in
`shared/budget.ts` is the single validator (integer, 0–100,000,000), and nothing multiplies or divides by
100. Display goes through one `Intl.NumberFormat('sr-Latn-RS')` with zero fraction digits, so a dot groups
thousands and a decimal comma is never printed; `parseAmount()` reads `1450` and `1.450` alike and rejects
anything carrying a comma or a decimal point. Backups written before migration `0003` still hold paras —
`parseBackup()` reconciles those exactly in paras (`toParas`) and rounds only on the way into the database
(`importedDinars`), so an old copy still restores. Never introduce a float column or a second parser.

**Optimistic concurrency.** `months` and `expenses` carry a `version`; every write is
`UPDATE … WHERE id=? AND version=?` and a zero-row result becomes a 409 telling the user to refresh.
`version: 0` on a month means "insert".

**Change detection.** `state_revision` is a single row bumped by six triggers (insert/update/delete on
both tables). `GET /api/state?since=N` returns `{unchanged:true}` when the client is current. `useBudget()`
in `src/lib/api.ts` polls every 20s plus on visibility/focus/online, holds a `writeLock` so polls never
race a mutation, and uses a `generation` counter to discard stale responses.

**Idempotency.** A client-generated `requestId` *is* the expense primary key. Insert is
`ON CONFLICT DO NOTHING RETURNING *`; the stored `original_payload` is compared to the retried payload, so
the same id with different data is a 409 and a retry of a since-deleted purchase returns `deleted: true`
rather than resurrecting it.

**Import is one-shot.** `POST /api/import` accepts both the legacy budget map and `finansije-v2` backups,
verifies that daily totals reconcile with individual purchases, and commits an `imports` lock row in the
same D1 batch as the data — so it can only ever land in an empty database, and an identical re-import is a
no-op rather than a duplicate.

**Frontend.** `src/App.tsx` (~730 lines) is the whole screen and owns all UI state; `useBudget()` owns all
server state and is the only place that calls `api()`. Mutations go through `budget.mutate(path, method,
payload, successMessage)`, which reloads state and surfaces a Serbian message. `ChartsPanel` is
`lazy()`-loaded (Recharts). Styling is Tailwind with a `dark` class on `<html>`.

**GPT contract.** `worker/openapi.ts` generates the Actions schema from the request origin — it exposes
exactly two operations and no secrets, and `tests/worker.test.ts` asserts that. `GPT_INSTRUCTIONS.md` is
the GPT's system prompt; if you change `addExpense` semantics (it *adds to* a day's total, never replaces
it), update that file, `openapi.ts`, and `GPT_SETUP.md` together.

## Secrets and deployment

`.dev.vars` (local) and Cloudflare secrets (production) supply `PASSWORD_HASH`, `OAUTH_CLIENT_ID`,
`OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URIS`. `scripts/setup-secrets.mjs` generates a 192-bit random
household key — the fast unsalted SHA-256 verification is deliberate and only safe because the key is
random, so never swap in a human-chosen password. Production secrets live in the git-ignored
`secrets.local.json`, uploaded with `npx wrangler secret bulk secrets.local.json`; `npm run deploy`
intentionally creates no resources and uploads no secrets. No `VITE_*` variable may carry a secret.

The GPT's real OAuth callback comes from `npx wrangler tail` (`redirect_uri` in the actual request), not
from what the ChatGPT editor displays — the editor showed three different ids for one GPT. See `LIVE.md`
for the deployment log, `DEPLOYMENT.md` for the setup runbook, `GPT_SETUP.md` for connecting a GPT.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->
