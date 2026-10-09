import { defineConfig } from '@playwright/test';

// Ensure LD_LIBRARY_PATH includes local libraries for headless chromium
if (!process.env.LD_LIBRARY_PATH?.includes('/home/anishb/.local/lib')) {
  process.env.LD_LIBRARY_PATH = `/home/anishb/.local/lib:${process.env.LD_LIBRARY_PATH || ''}`;
}

export default defineConfig({
  testDir: './e2e',
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
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          env: {
            ...process.env,
            LD_LIBRARY_PATH: `/home/anishb/.local/lib:${process.env.LD_LIBRARY_PATH || ''}`,
          },
        },
      },
    },
  ],
});
