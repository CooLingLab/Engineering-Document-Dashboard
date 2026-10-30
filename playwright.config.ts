import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined } } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: [
    { command: 'npm run dev -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true, env: { BASE_PATH: '/' } },
    { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173/Engineering-Document-Dashboard/', reuseExistingServer: true,
      env: { BASE_PATH: '/Engineering-Document-Dashboard/' } },
  ],
});
