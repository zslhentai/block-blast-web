import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, workers: 2,
  timeout: 30000, expect: { timeout: 5000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/block-blast-web/',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone-chromium', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' } },
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
    ...(process.env.E2E_WEBKIT === '1' ? [{ name: 'webkit', use: { ...devices['iPhone 14'],
      browserName: 'webkit' as const, launchOptions: { executablePath: undefined } } }] : []),
  ],
  webServer: {
    command: 'bun run build && bun scripts/serve-dist.ts',
    url: 'http://127.0.0.1:4173/block-blast-web/', reuseExistingServer: false, timeout: 30000,
  },
});
