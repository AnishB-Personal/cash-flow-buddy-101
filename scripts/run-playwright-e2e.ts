import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Ensure LD_LIBRARY_PATH includes local libraries for headless chromium
const localLibPath = '/home/anishb/.local/lib';
const currentLdPath = process.env.LD_LIBRARY_PATH || '';
if (!currentLdPath.includes(localLibPath)) {
  process.env.LD_LIBRARY_PATH = `${localLibPath}:${currentLdPath}`;
}

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

console.log('======================================================================');
console.log(' CollectFlow Stage 2 - Playwright Multi-Viewport Regression Runner');
console.log(' Target Server: http://127.0.0.1:3000');
console.log(' Viewports: 1440px (Desktop), 768px (Tablet), 390px (Mobile), 320px (Narrow)');
console.log(' Coverage: Drawer Lifecycle, Order Workflows, Baseline Restoration');
console.log('======================================================================\n');

const startTime = Date.now();

// Execute playwright test runner
const child = spawn(
  'npx',
  ['playwright', 'test', '--reporter=list'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
    },
    stdio: 'inherit',
  }
);

child.on('close', code => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n======================================================================');
  console.log(` Test Execution Finished in ${duration}s with exit code ${code}`);

  // Check generated screenshots
  if (fs.existsSync(SCREENSHOTS_DIR)) {
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log(` Screenshots captured (${files.length}):`);
    files.forEach(f => {
      const stats = fs.statSync(path.join(SCREENSHOTS_DIR, f));
      console.log(`   - ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
    });
  }
  console.log('======================================================================\n');

  process.exit(code ?? 0);
});

child.on('error', err => {
  console.error('Failed to launch Playwright runner:', err);
  process.exit(1);
});
