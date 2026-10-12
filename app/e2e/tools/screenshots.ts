// Captures every gallery preset as a PNG (plan 3.4). Needs a build: `npm run build && npm run screenshots`.
// Usage: npm run screenshots [-- --out=../docs/final/ux] [--views=fit] [--states=getReady,summary]
// `--views=fit` shoots the fit-check sizes (e2e/gallery.spec.ts) instead of phone + desktop.

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const PORT = 4174;
const base = `http://localhost:${PORT}/`;
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = arg('out') ?? '../docs/final/ux';
const only = arg('states')?.split(',');
mkdirSync(out, { recursive: true });

const server: ChildProcess = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
try {
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(base).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch();
  const views =
    arg('views') === 'fit'
      ? [
          { name: 'small', ctx: { ...devices['Pixel 7'], viewport: { width: 360, height: 640 } } },
          { name: 'tall', ctx: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
          { name: 'landscape', ctx: { ...devices['Pixel 7'], viewport: { width: 844, height: 390 } } },
        ]
      : [
          { name: 'phone', ctx: devices['Pixel 7'] },
          { name: 'desktop', ctx: { viewport: { width: 1280, height: 800 } } },
        ];
  for (const v of views) {
    const context = await browser.newContext({ ...v.ctx, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${base}?gallery`);
    const ids = await page
      .locator('a[href*="state="]')
      .evaluateAll((as) =>
        as.map((a) => new URL((a as HTMLAnchorElement).href).searchParams.get('state') ?? ''),
      );
    const shots = ids.filter((id) => id && (!only || only.includes(id)));
    for (const id of shots) {
      await page.goto(`${base}?state=${id}&auto=0`);
      await page.getByRole('navigation', { name: 'Main' }).waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${v.name}-${id}.png` });
    }
    console.log(`${v.name}: ${shots.length} screenshots`);
    await context.close();
  }
  await browser.close();
} finally {
  server.kill();
}
