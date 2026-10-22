import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://localhost:3012', viewport: { width: 1440, height: 1000 }, channel: process.env.PW_CHANNEL || 'msedge', trace: 'retain-on-failure' },
  webServer: { command: 'node src/server.js', url: 'http://localhost:3012/api/health', env: { PORT: '3012', TURSO_DATABASE_URL: 'file:browser-tests.db', TURSO_AUTH_TOKEN: '' }, reuseExistingServer: false },
});
