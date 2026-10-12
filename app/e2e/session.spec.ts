// Flows 1–2 (spec §5.4) in sim mode, plus keyboard and layout-shift checks (plan 2.10).
import { expect, test } from '@playwright/test';
import { SETTINGS_KEY } from '../src/settings/storage.ts';
import { TAP_GUARD_MS } from '../src/ui/useTapGuard.ts';
import { chip, fastSettings, getReady, hero, historyRows, pass, SIM_URL, startSession } from './helpers.ts';

test.beforeEach(async ({ page }) => fastSettings(page));

test('flow 1: GET READY → START → laps, best highlighted', async ({ page }) => {
  await startSession(page);
  await expect(hero(page)).toHaveText('--.--');
  await expect(page.getByTestId('lap-summary')).toHaveText('Waiting for first pass');

  await pass(page);
  await expect(chip(page)).toHaveText('Timing');
  await expect(page.getByTestId('lap-summary')).toHaveText('Lap 1 running');

  // Lap times ≈ 1.2 s, 0.5 s (best), 1.0 s, 0.8 s
  await pass(page, 900);
  await pass(page, 200);
  await pass(page, 700);
  await pass(page, 500);

  await expect(page.getByTestId('lap-summary')).toContainText('Laps 4');
  await expect(historyRows(page)).toHaveCount(3);
  const best = historyRows(page).and(page.locator('[data-best]'));
  await expect(best).toHaveCount(1);
  await expect(best).toContainText('#2');
  await expect(best).toContainText('Best');
  await expect(page.getByText('Lap 5 running')).toBeVisible();
});

test('flow 1b: latest lap best → green hero with BEST badge', async ({ page }) => {
  await startSession(page);
  await pass(page);
  await pass(page, 900);
  await pass(page, 200); // faster → best
  await expect(
    page.getByRole('region', { name: 'Latest lap' }).getByText('Best', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-best]')).toHaveCount(0);
});

test('best 3 laps: Get ready! → Best 3 laps → Start → 4 passes → summary shows the best 3 total', async ({
  page,
}) => {
  await startSession(page, 'Best 3 laps');
  await pass(page);
  await pass(page, 400);
  await pass(page, 400);
  await expect(page.getByTestId('lap-summary')).toHaveText(/^Laps 2·Best 3 --\.--$/);
  await pass(page, 400);
  await expect(page.getByTestId('lap-summary')).toHaveText(/^Laps 3·Best 3 \d+\.\d\d$/);
  await expect(
    page.getByRole('region', { name: 'Latest lap' }).getByText('Best 3', { exact: true }),
  ).toBeVisible();
  await expect(historyRows(page).and(page.locator('[data-best3]'))).toHaveCount(2);
});

test('flow 2: STOP / CONTINUE keeps laps and drops the in-progress lap; END → dialog, Cancel keeps it', async ({
  page,
}) => {
  await startSession(page);
  await pass(page);
  await pass(page, 400);
  await pass(page, 400);
  await expect(page.getByTestId('lap-summary')).toContainText('Laps 2');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(chip(page)).toHaveText('Paused');
  await expect(page.getByText('2 laps', { exact: true })).toBeVisible();

  await page.waitForTimeout(1500); // paused time is never counted
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(chip(page)).toHaveText('Stand-by');
  await pass(page); // only sets the reference
  await expect(page.getByTestId('lap-summary')).toContainText('Laps 2');
  await pass(page, 400);
  await expect(page.getByTestId('lap-summary')).toContainText('Laps 3');
  const lap3 = Number((await hero(page).textContent()) ?? '99');
  expect(lap3).toBeLessThan(1.2); // not 1.5 s + the paused gap

  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'End' }).click();
  const dialog = page.getByRole('dialog', { name: 'End session?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('3 laps will be discarded.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(chip(page)).toHaveText('Paused');
  await expect(page.getByTestId('lap-summary')).toContainText('Laps 3');

  await page.waitForTimeout(TAP_GUARD_MS); // END's tap guard counts from its first tap, before Cancel
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Best lap' })).toContainText(/\d\.\d\d/);
  await expect(page.getByRole('region', { name: 'Best 3 laps' })).toContainText('--.--');
  await page.keyboard.press('Space'); // no global action on Summary
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'New session' }).last().click();
  await expect(page.getByRole('button', { name: 'Get ready!' })).toBeVisible();
});

test('END with 0 laps goes straight to Welcome', async ({ page }) => {
  await startSession(page);
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page.getByRole('button', { name: 'Get ready!' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('no layout shift on lap update', async ({ page }) => {
  await startSession(page);
  await pass(page);
  await pass(page, 300);
  const boxes = async () => ({
    hero: await page.getByRole('region', { name: 'Latest lap' }).boundingBox(),
    stop: await page.getByRole('button', { name: 'Stop' }).boundingBox(),
  });
  const before = await boxes();
  await pass(page, 300);
  await pass(page, 300);
  await page.waitForTimeout(300); // let the lap animation settle
  expect(await boxes()).toEqual(before);
});

test('full flow by keyboard: Space = primary action, P = pass, Esc closes dialogs', async ({ page }) => {
  await page.goto(SIM_URL);
  await page.waitForTimeout(350); // tap guard after the first screen
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Best lap' })).toBeFocused();
  await page.waitForTimeout(350);
  await page.keyboard.press('Enter'); // native click on the focused choice
  await expect(page.getByTestId('camera-health')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(chip(page)).toHaveText('Stand-by');
  await page.keyboard.press('p');
  await page.waitForTimeout(500);
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('lap-summary')).toContainText('Laps 1');
  await page.keyboard.press('Space');
  await expect(chip(page)).toHaveText('Paused');
  await page.waitForTimeout(350);
  await page.keyboard.press('Space');
  await expect(chip(page)).toHaveText('Stand-by');

  await page.getByRole('button', { name: 'New session' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'New session' })).toBeFocused(); // focus restored
  await expect(chip(page)).toHaveText('Stand-by');
});

test('Get Ready: Calibrate saves at once, survives a reload, shows in Configuration; Cancel keeps it', async ({
  page,
}) => {
  const startRatio = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').detection.startRatio, SETTINGS_KEY);
  await page.goto(SIM_URL);
  await getReady(page);
  await expect(page.getByTestId('camera-health')).toBeVisible();
  await page.getByRole('button', { name: 'Calibrate' }).click();
  await expect(page.getByText('Calibrating — keep the scene still…')).toBeVisible();
  await expect(page.getByTestId('calibration-result')).toContainText('Calibrated and saved', {
    timeout: 10_000,
  });
  const saved = await startRatio();
  expect(saved).not.toBe(0.02);

  // Cancel: a second (random) run would change the value; it must stay.
  await page.getByRole('button', { name: 'Calibrate' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Calibrating — keep the scene still…')).toHaveCount(0);
  await page.waitForTimeout(3500); // longer than the 3 s run
  expect(await startRatio()).toBe(saved);
  await expect(page.getByTestId('calibration-result')).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Configuration' }).click();
  await expect(page.getByRole('textbox', { name: 'Start ratio' })).toHaveValue(
    String(+(saved * 100).toPrecision(6)),
  );
});
