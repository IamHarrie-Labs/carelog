import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

// One app per warm function instance; the database itself lives in Turso, so any instance sees the same data.
let ready;
const getApp = () => (ready ??= openDb({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  .then((db) => createApp(db, { secureCookies: true, serveStaticFiles: false })));

export default {
  async fetch(req) {
    try { return (await getApp()).fetch(req); } catch (e) {
      ready = undefined;
      console.error(e);
      return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  },
};
