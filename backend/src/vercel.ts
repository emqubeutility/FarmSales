import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './create-app.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

// Bootstrapped once per warm function instance; concurrent cold requests share the promise.
let handler: Promise<Handler> | undefined;

async function init(): Promise<Handler> {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  handler ??= init().catch((err) => {
    handler = undefined; // let the next request retry instead of caching the failure
    throw err;
  });
  (await handler)(req, res);
}
