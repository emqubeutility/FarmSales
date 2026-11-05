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

  // express-session calls store.touch() on EVERY request to extend the cookie, and holds the response
  // until that UPDATE finishes — one extra database round trip per call. Only touch a given session
  // once every 10 minutes; the cookie lifetime is 12 h so this loses nothing.
  class ThrottledTouchStore extends PgSessionStore {
    private readonly lastTouch = new Map<string, number>();
    touch(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void) {
      const now = Date.now();
      if ((this.lastTouch.get(sid) ?? 0) > now - 10 * 60_000) return cb?.();
      this.lastTouch.set(sid, now);
      if (this.lastTouch.size > 5000) this.lastTouch.clear();
      return super.touch(sid, sess, cb as never);
    }
  }

  app.use(
    session({
      // The "session" table is created by a Prisma migration.
      store: new ThrottledTouchStore({ pool: pgPool }),
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
