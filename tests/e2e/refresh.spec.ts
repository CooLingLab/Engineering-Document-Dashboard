import { expect, test } from '@playwright/test';

test('periodic refresh updates the version without invoking a model or losing manual status', async ({ page }) => {
  let version = 'commit-1';
  let checks = 0;
  const unexpected: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:5173') return route.continue();
    if (url.origin !== 'https://api.github.com') { unexpected.push(url.origin); return route.abort(); }
    let body: unknown;
    if (url.pathname === '/repos/fixture/demo') body = { id: 123, name: 'demo', owner: { login: 'fixture' }, default_branch: 'main' };
    else if (url.pathname.endsWith('/branches')) body = [{ name: 'main' }];
    else if (url.pathname.includes('/commits/')) { checks++; body = { sha: version }; }
    else if (url.pathname.endsWith('/contents/docs/development')) body = [];
    else return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ status: 200, json: body });
  });
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('GitHub 仓库地址').fill('fixture/demo');
  await page.getByRole('button', { name: /连接仓库/ }).click();
  await expect(page.getByText('fixture/demo', { exact: true })).toBeVisible();
  await page.getByLabel('手动状态').selectOption('done');
  expect(checks).toBe(1);
  version = 'newcode2';
  await page.clock.fastForward('05:01');
  await expect.poll(() => checks).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/版本 newcode/)).toBeVisible();
  await expect(page.getByLabel('手动状态')).toHaveValue('done');
  expect(unexpected).toEqual([]);
});
