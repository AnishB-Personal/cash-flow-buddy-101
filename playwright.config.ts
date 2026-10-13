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
  webServer: {
    command: (process.env.VITE_API_MODE === 'live' || process.env.LIVE_MODE === '1')
      ? 'VITE_API_MODE=live VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --port 3000'
      : 'npm run dev -- --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 60000,
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
