import { serve } from '@hono/node-server';
import { openDb } from './db.js';
import { createApp } from './app.js';

const db = await openDb({ url: process.env.TURSO_DATABASE_URL || 'file:carelog.db', authToken: process.env.TURSO_AUTH_TOKEN });
const app = createApp(db, { secureCookies: process.env.NODE_ENV === 'production' });
const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`CareLog on http://localhost:${port}`);
