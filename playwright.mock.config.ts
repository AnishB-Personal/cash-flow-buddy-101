import { defineConfig } from '@playwright/test';

// Portable library path extension for headless browsers (configured via env if needed)
const extraLibPath = process.env.PLAYWRIGHT_LD_LIBRARY_PATH;
const ldLibraryPath = extraLibPath
  ? `${extraLibPath}:${process.env.LD_LIBRARY_PATH || ''}`
  : process.env.LD_LIBRARY_PATH;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/*live*.spec.ts'],
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'VITE_API_MODE=mock npm run dev -- --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    {
      name: 'chromium-mock',
      use: {
        browserName: 'chromium',
        launchOptions: {
          env: {
            ...process.env,
            ...(ldLibraryPath ? { LD_LIBRARY_PATH: ldLibraryPath } : {}),
          },
        },
      },
    },
  ],
});
