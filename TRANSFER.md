# Transferring this project to another machine

## 1. Code
1. Install Node.js 20+ and PostgreSQL 16 locally (or run `docker-compose up -d` if you have Docker instead).
2. `npm install` from the project root (installs all workspaces).
3. Copy `.env.example` to `.env` — the defaults already match this dump (db `farmsales`, user/password `farmsales`/`farmsales`, port 5432).

## 2. Database
This zip includes `backend/db/farmsales.sql` — a full dump of the `farmsales` database (schema + data), with the `session` table excluded on purpose (it's just login-session storage, recreated automatically).

Restore it into a fresh local Postgres:
```
createdb -U farmsales farmsales
psql -U farmsales -d farmsales -f backend/db/farmsales.sql
```
(If the `farmsales` role/database don't exist yet on the new machine, create them first, or just run `docker-compose up -d` which creates them automatically, then run the `psql` restore command above.)

## 3. Finish setup
```
npm run prisma:generate
npm run dev:api     # http://localhost:3000
npm run dev:web     # staff app
npm run dev:shop    # public online shop
```

## Windows on ARM64 only
If the new machine is Windows on ARM64, Prisma's query engine has no native ARM64 Windows build.
Download an x64 Node build into `.tools/` (gitignored) and put it first on PATH for anything that
touches the database (`dev:api`, `db:seed`, etc.) — see the note in `CLAUDE.md`. Not needed on
x64 Windows/Mac/Linux.
