import { defineConfig, devices } from '@playwright/test'

// E2E tests run against the real app: the Express API on port 5000 (fresh seeded database)
// and the Vite dev server on port 5173, which proxies /api to the API.
export default defineConfig({
  testDir: './tests',
  // The tests share one database, so they run one at a time
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // No retries: a retry would run on the database the failed attempt already changed
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/start-api.js',
      url: 'http://localhost:5000/api/health',
      // Always start a new API so the database is fresh; stop your own dev server on 5000 first
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: '../client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
