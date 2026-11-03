// Creates the first Owner account. This is an internal staff app with no public sign-up, so
// someone has to exist before anyone can log in. Safe to re-run: it's a no-op if an Owner exists.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existingOwner = await prisma.user.findFirst({ where: { roles: { has: 'OWNER' } } });
  if (existingOwner) {
    console.log(`Owner already exists: ${existingOwner.email}`);
    return;
  }

  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@example.com';
  const password = process.env.SEED_OWNER_PASSWORD ?? 'change-me-now';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { name: 'Owner', email, passwordHash, roles: ['OWNER'] },
  });

  console.log(`Created Owner account: ${email} / ${password} — log in once and change this password.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
