import { expect, test } from '@playwright/test';

test('the canonical route is locked while stage document choices remain editable', async ({ page }) => {
  await page.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    if (url.pathname === '/repos/fixture/demo') body = { id: 123, name: 'demo', owner: { login: 'fixture' }, default_branch: 'main' };
    else if (url.pathname.endsWith('/branches')) body = [{ name: 'main' }];
    else if (url.pathname.includes('/commits/')) body = { sha: 'c1' };
    else if (url.pathname.endsWith('/contents/docs/development')) body = [];
    else return route.fulfill({ status: 404, json: { message: 'Not Found' } });
    return route.fulfill({ status: 200, json: body });
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  await page.getByLabel('GitHub 仓库地址').fill('fixture/demo');
  await page.getByRole('button', { name: /连接仓库/ }).click();
  await expect(page.getByText('fixture/demo', { exact: true })).toBeVisible();

  const stages = page.getByRole('navigation', { name: '八阶段开发流程' }).getByRole('button');
  await expect(stages).toHaveCount(8);
  await expect(page.getByRole('button', { name: '编辑流程' })).toHaveCount(0);
  await page.getByRole('button', { name: /Strategic DDD/ }).click();
  await page.getByLabel('文档取舍：02-domain.md').selectOption('not-needed');
  await expect(page.getByLabel('文档取舍：02-domain.md')).toHaveValue('not-needed');
  await page.getByLabel('手动状态').selectOption('skipped');
  await expect(page.getByText(/不会被视为已完成/)).toBeVisible();
  await expect(stages).toHaveCount(8);
});
