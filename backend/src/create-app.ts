import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import passport from 'passport';
import pgSession from 'connect-pg-simple';
import pg from 'pg';
import { AppModule } from './app.module.js';

// Shared by the long-running server (main.ts) and the Vercel function (vercel.ts).
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Behind a proxy (Vercel, load balancers) req.secure is only true with this, and
  // without it the secure session cookie is never set.
  app.set('trust proxy', 1);

  // On serverless every instance opens its own connections, so keep this pool tiny.
  const pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 1 : 10,
  });
  const PgSessionStore = pgSession(session);

  app.use(
    session({
      // The "session" table is created by a Prisma migration.
      store: new PgSessionStore({ pool: pgPool }),
      secret: process.env.SESSION_SECRET ?? 'dev-only-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 12, // 12h — a staff shift
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  return app;
}
