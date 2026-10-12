// Flow 6 (spec §5.4): axe on every gallery preset (Chromium + WebKit), plus a fit check at phone sizes.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PRESETS } from '../src/ui/gallery/presets.ts';

/** Small phone, tall phone, phone landscape. */
const VIEWPORTS = [
  { name: 'small', width: 360, height: 640 },
  { name: 'tall', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
] as const;
type ViewportName = (typeof VIEWPORTS)[number]['name'];

/** Long pages by design: only the horizontal check applies. */
const SCROLLS = new Set(['configClean', 'configDirty', 'configInvalid', 'configUpdate', 'dialogDiscard']);

const CAMERA_ERRORS = [
  'permission',
  'notFound',
  'busy',
  'overconstrained',
  'insecure',
  'ended',
  'unknown',
].map((e) => `cameraError-${e}`);
/**
 * Screens that already scrolled vertically when this check landed (factory/backlog.md, "Fit every
 * screen"). Delete an entry when its screen fits; never add one to get a change through.
 */
const KNOWN_OVERFLOW: Record<ViewportName, string[]> = {
  small: [
    'installHint',
    'cameraStarting',
    'getReady',
    'getReadyLowFps',
    ...CAMERA_ERRORS.filter((id) => id !== 'cameraError-notFound'),
    'summary',
  ],
  tall: ['permission', 'busy', 'overconstrained', 'insecure'].map((e) => `cameraError-${e}`),
  landscape: [
    'welcome',
    'installPrompt',
    'installHint',
    'updateToast',
    'storageToast',
    ...CAMERA_ERRORS,
    'summary',
    // A banner pushes the lap hero out of the session header.
    'sessionLowFps',
    'audioLocked',
    'wakeLock',
    'pausedHidden',
    'pausedCameraLost',
  ],
};

test('the gallery lists every preset', async ({ page }) => {
  await page.goto('./?gallery');
  await expect(page.getByRole('heading', { name: 'State gallery' })).toBeVisible();
  await expect(page.getByRole('link').filter({ hasNotText: 'Open the app' })).toHaveCount(PRESETS.length);
});

for (const p of PRESETS) {
  test(`axe: ${p.group} / ${p.title}`, { tag: '@full' }, async ({ page }) => {
    await page.goto(`./?state=${p.id}`);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SIMULATED' })).toBeVisible();
    await page.waitForTimeout(400); // screen / dialog animations

    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(serious).toEqual([]);
  });

  test(`fit: ${p.group} / ${p.title}`, { tag: '@full' }, async ({ page }) => {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(`./?state=${p.id}&auto=0`);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
      await page.waitForTimeout(400);

      const fit = await page.evaluate(() => {
        const root = document.documentElement;
        // Content cut off inside a scroll container that isn't meant to scroll (marked `data-scroll`).
        const clipped = [...document.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const { overflowY } = getComputedStyle(el);
            return (
              (overflowY === 'auto' || overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight + 1 &&
              !el.closest('[data-scroll]')
            );
          })
          .map(
            (el) => `${el.tagName.toLowerCase()}.${el.className.toString().split(' ').slice(0, 3).join('.')}`,
          );
        return {
          x: root.scrollWidth - window.innerWidth,
          y: root.scrollHeight - window.innerHeight,
          clipped,
        };
      });
      const at = `${vp.name} ${vp.width}×${vp.height}`;
      expect.soft(fit.x, `${at}: horizontal scroll (px)`).toBeLessThanOrEqual(0);
      if (SCROLLS.has(p.id) || KNOWN_OVERFLOW[vp.name].includes(p.id)) continue;
      expect.soft(fit.y, `${at}: vertical scroll (px)`).toBeLessThanOrEqual(0);
      expect.soft(fit.clipped, `${at}: content scrolls inside a fixed area`).toEqual([]);
    }
  });
}
