import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { PrismaService } from './prisma/prisma.service.js';

// Boots the real DI graph (AuthModule, PassportModule, guards, UsersModule, ...) with PrismaService
// stubbed out, so this catches wiring mistakes (missing provider, bad import) without needing a
// live Postgres connection.
describe('AppModule', () => {
  it('resolves the full dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => {}, onModuleDestroy: async () => {} })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();
  });
});
