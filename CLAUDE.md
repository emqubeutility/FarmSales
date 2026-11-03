# CLAUDE.md

Project: sales and inventory PWA for an organic farm-products start-up (ghee, flours, millets), Mumbai. Full brief in `HANDOVER.md`. Visual reference in `docs/mock/index.html`.

## Stack
React + TypeScript (Vite) PWA, NestJS API, PostgreSQL via Prisma, pg-boss or BullMQ. Online only. India hosting. npm workspaces monorepo (`frontend/web`, `backend/api`, `shared`).

## Non-negotiables
- Money is integer paise or numeric(12,2). Never floats.
- Stock ledger is append-only. Corrections are reversing entries.
- Totals, tax, discount limits, FEFO batch picks and bill numbers are decided on the server, in one transaction. The client only previews.
- Allocation is FEFO. Scanning a label `ITEMCODE-BATCHCODE` picks that exact batch. Bundles have no batch of their own, so their components are picked FEFO.
- Costing is item-level weighted average. Batches carry no cost.
- MRP is tax-inclusive. GST is CGST+SGST, rates effective-dated per tax class. Round total to the nearest rupee.
- Cashier discount is capped at the channel max, no override.
- No till-cash management. Record payments only.
- Money, tax and FEFO logic lives in `shared` as pure, unit-tested functions.

## Conventions
- TypeScript strict. Zod for validation at the API boundary, shared with the web app.
- Small PRs, one phase step at a time (see build order in HANDOVER.md section 8).
- Tablet-first touch UI, 44px minimum targets, minimal keystrokes.
- Do not invent GST rates, HSN codes, GSTIN, FSSAI or UPI details. Leave them as config placeholders.

## Commands
- Install: `npm install` (root, installs all workspaces)
- Postgres: `docker-compose up -d` (needs `.env` copied from `.env.example`), or a native local install
- Prisma: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:studio`
- Seed the first Owner account: `npm run db:seed` (reads `SEED_OWNER_EMAIL`/`SEED_OWNER_PASSWORD` env vars, defaults otherwise — change the password after first login)
- Dev: `npm run dev:api`, `npm run dev:web`
- Test: `npm test` (shared package + api), or `npm test -w shared` for just the money/FEFO unit tests
- Build: `npm run build`

## Windows on ARM64 dev machines
Prisma 5.x's query engine ships no native binary for Windows ARM64 — anything that actually
*runs* a Prisma query (the seed script, `dev:api`, `start:prod`) fails with "not a valid Win32
application" under an arm64 Node process, even though `prisma generate`/`migrate` work fine
(those spawn a separate schema-engine exe, which Windows emulates transparently; the query engine
is a native addon loaded in-process, which can't be emulated). `prisma generate`, builds, and unit
tests (which mock PrismaService) are unaffected.
Workaround used on this machine: download an x64 Node build into `.tools/` (gitignored, not
committed) and put it first on PATH only for the command that touches the DB, e.g.:
```
export PATH="$PWD/.tools/node-v24.14.0-win-x64:$PATH"
npm run db:seed
node backend/api/dist/main.js
```
Not needed on x64 Windows/Mac/Linux dev machines, and not needed in production (Linux x64).
