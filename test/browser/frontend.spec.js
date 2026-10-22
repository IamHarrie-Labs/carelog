import { test, expect } from '@playwright/test';

test('landing, account, persistent care record and every workspace section work on desktop and mobile', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Care changes hands.');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/design-concepts/implemented-hero.png' });
  await page.screenshot({ path: 'docs/design-concepts/implemented-desktop.png', fullPage: true });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  await page.getByTestId('landing-login').click();
  await page.getByTestId('auth-email').fill('missing@example.test');
  await page.getByTestId('auth-password').fill('unmatched-test-password');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('do not match');
  await page.getByTestId('mode-signup').click();
  await page.getByTestId('auth-name').fill('Robin Test');
  await page.getByTestId('auth-email').fill(`robin.${Date.now()}@example.test`);
  await page.getByTestId('auth-password').fill('synthetic-test-password');
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('new-circle').click();
  await page.getByTestId('field-name').fill('Frontend test circle');
  await page.getByTestId('field-recipient_name').fill('Margaret');
  await page.getByTestId('modal-submit').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Today');
  const circleUrl = page.url();
  await page.locator('[data-testid^="given-"]').first().click();
  await expect(page.locator('[data-testid^="status-"]').first()).toContainText('Robin Test');
  await page.reload();
  await expect(page.locator('[data-testid^="status-"]').first()).toContainText('Robin Test');
  for (const section of ['today','handoff','items','timeline','people','emergency','money','load','appointments','supplies','documents','digest']) {
    await page.getByTestId(`tab-${section}`).click();
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main .alert.bad')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByTestId('tab-items').click();
  await page.getByTestId('add-item').click();
  await page.getByTestId('field-title').fill('Book Thursday transport');
  await page.getByTestId('modal-submit').click();
  await expect(page.locator('main')).toContainText('Book Thursday transport');
  await page.screenshot({ path: 'docs/design-concepts/implemented-workspace.png', fullPage: true });
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(circleUrl);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/design-concepts/implemented-mobile-app.png', fullPage: true });
  await page.getByTestId('logout').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Care changes hands.');
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('link', { name: 'How it works' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.screenshot({ path: 'docs/design-concepts/implemented-mobile-landing.png', fullPage: true });
  await expect(page.getByRole('link', { name: 'Create a care circle', exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

test('approved hero keeps consistent branding, centered navigation and compact icons at portrait and landscape widths', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.cl-story figcaption')).toHaveCount(0);
  await expect(page.locator('.cl-open-label')).toHaveCount(0);
  await expect(page.locator('.cl-wave i')).toHaveCount(15);
  await expect(page.locator('.cl-check')).toHaveAttribute('src', '/assets/record-check.svg');
  const navigation = await page.locator('.cl-nav').boundingBox();
  const links = await page.locator('.cl-nav-links').boundingBox();
  expect(Math.abs((navigation.x + navigation.width / 2) - (links.x + links.width / 2))).toBeLessThan(2);
  const gap = await page.locator('.cl-record').first().evaluate(el => {
    const icon = el.children[0].getBoundingClientRect();
    const words = el.children[1].getBoundingClientRect();
    return words.left - icon.right;
  });
  expect(gap).toBeLessThanOrEqual(10);
  const conversationBox = await page.locator('.cl-conversation').boundingBox();
  const recordsBox = await page.locator('.cl-records').boundingBox();
  expect(recordsBox.x - conversationBox.x - conversationBox.width).toBeLessThanOrEqual(25);
  const logoSrc = await page.locator('.cl-nav .cl-brand img').getAttribute('src');
  for (const route of ['login', 'signup']) {
    await page.goto(`/#/${route}`);
    await expect(page.locator('.cl-auth .cl-brand img')).toHaveAttribute('src', logoSrc);
    await expect(page.locator('.cl-wordmark')).toHaveCSS('font-family', /DM Sans/);
  }
  await page.goto('/');
  for (const [width, height] of [[360, 800], [390, 844], [844, 390], [1024, 768], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.cl-check')).toBeVisible();
    await page.screenshot({ path: `docs/design-concepts/refined-${width}x${height}.png`, fullPage: true });
  }
});
