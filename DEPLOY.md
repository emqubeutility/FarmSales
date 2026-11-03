# Deploying to Vercel (single project)

Static Vite app (`frontend/`) + the NestJS API as one serverless function (`api/index.mjs` -> `backend/dist/vercel.js`).
All `/api/*` requests are rewritten to the function; everything else falls back to `index.html`. Same origin, so no CORS.

## One-time setup
1. Create a hosted Postgres in/near Mumbai (Neon, Supabase, etc.). Get a **pooled** URL (pgbouncer, transaction mode) and a **direct** URL.
2. Import the repo in Vercel. Leave Root Directory blank (`./`): the git repo root is the `prisma/` folder that holds `vercel.json`. If you instead import a parent folder, set Root Directory to `prisma`. This is a dashboard setting and cannot go in `vercel.json`. Framework preset: Other. Build/install/output are set in `vercel.json`.
3. Environment variables (Production, and Preview if you want previews to work):
   - `DATABASE_URL` pooled URL, with `?pgbouncer=true&connection_limit=1` appended (Prisma needs both).
   - `DIRECT_URL` direct URL, used by `prisma migrate deploy`.
   - `SESSION_SECRET` long random string.
   - `NODE_ENV=production` (Vercel sets this for production builds; makes the session cookie `secure`).
   - `VITE_API_URL` leave unset.
4. Deploy. Production builds run `prisma migrate deploy` (preview builds skip it).
5. Seed the first Owner once, from your machine: `cd backend && DATABASE_URL=<direct url> DIRECT_URL=<direct url> SEED_OWNER_EMAIL=... SEED_OWNER_PASSWORD=... npm run db:seed`.

## Notes
- Function region is `bom1` (Mumbai) in `vercel.json`; keep the database in the same region.
- Local dev is unchanged: `npm run dev:api` / `npm run dev:web`, `DIRECT_URL` = `DATABASE_URL` in `backend/.env`.
- Interactive Prisma transactions (billing, FEFO) work through a transaction-mode pooler; keep them short (default timeout 5s).
