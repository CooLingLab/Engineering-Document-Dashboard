import { expect, test } from '@playwright/test';

test('adding a stage keeps it inside the visible flow canvas', async ({ page }) => {
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
  await page.getByRole('button', { name: '编辑流程' }).click();
  await page.getByLabel('新环节名称').fill('复盘');
  await page.getByRole('button', { name: '添加环节' }).click();
  const canvas = page.locator('.flow-canvas');
  const node = page.locator('.react-flow__node').filter({ hasText: '复盘' });
  await expect(node).toHaveCount(1);
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(async () => {
    const canvasBox = await canvas.boundingBox();
    const nodeBox = await node.boundingBox();
    if (!canvasBox || !nodeBox) return false;
    return nodeBox.x >= canvasBox.x && nodeBox.x + nodeBox.width <= canvasBox.x + canvasBox.width;
  }, { timeout: 3000 }).toBe(true);
  await page.getByLabel('起点').selectOption({ label: '需求' });
  await page.getByLabel('终点').selectOption({ label: '复盘' });
  await page.getByRole('button', { name: '添加连线' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await page.getByLabel('选择流程范式').selectOption('blank');
  await page.getByRole('button', { name: '应用此流程' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.getByRole('button', { name: '准备恢复' }).first().click();
  await page.getByRole('button', { name: '确认恢复' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});
