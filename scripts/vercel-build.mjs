// Vercel build: Prisma client -> Nest API (backend/dist) -> Vite app (frontend/dist).
// Migrations run only for production deploys so previews never touch the production database.
import { spawnSync } from 'node:child_process';

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}  (${cwd})`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['run', 'prisma:generate'], 'backend');
if (process.env.VERCEL_ENV === 'production') {
  run('npm', ['run', 'prisma:deploy'], 'backend');
} else {
  console.log('\nSkipping prisma migrate deploy (VERCEL_ENV is not "production").');
}
run('npm', ['run', 'build'], 'backend');
run('npm', ['run', 'build'], 'frontend');
