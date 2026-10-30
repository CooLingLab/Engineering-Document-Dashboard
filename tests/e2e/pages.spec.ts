import { expect, test } from '@playwright/test';

test('the built website loads and refreshes under a GitHub Pages repository subpath', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = 'http://127.0.0.1:4173/Engineering-Document-Dashboard/#home';
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /让每一步开发/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /让每一步开发/ })).toBeVisible();
  expect(errors).toEqual([]);
});
