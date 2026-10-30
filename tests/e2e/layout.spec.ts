import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`route layout remains usable at ${viewport.width}px`, async ({ page, browserName }) => {
    await page.setViewportSize(viewport);
    await page.route('https://api.github.com/**', async (route) => {
      const url = new URL(route.request().url());
      const doc = '# 需求说明\n这是用于视觉检查的虚构开发文档。';
      let body: unknown;
      if (url.pathname === '/repos/fixture/demo') body = { id: 123, name: 'demo', owner: { login: 'fixture' }, default_branch: 'main' };
      else if (url.pathname.endsWith('/branches')) body = [{ name: 'main' }];
      else if (url.pathname.includes('/commits/')) body = { sha: 'c1' };
      else if (url.pathname.endsWith('/contents/docs/development')) body = [{ path: 'docs/development/02-domain.md', sha: 'b1', size: Buffer.byteLength(doc), type: 'file' }];
      else if (url.pathname.endsWith('/02-domain.md')) body = { path: 'docs/development/02-domain.md', sha: 'b1', size: Buffer.byteLength(doc), type: 'file', encoding: 'base64', content: Buffer.from(doc).toString('base64') };
      else return route.fulfill({ status: 404, json: {} });
      return route.fulfill({ status: 200, json: body });
    });
    await page.goto('/');
    await page.getByLabel('GitHub 仓库地址').fill('fixture/demo');
    await page.getByRole('button', { name: /连接仓库/ }).click();
    await expect(page.getByRole('heading', { name: '固定八阶段开发路线' })).toBeVisible();
    if (viewport.width < 700) expect((await page.getByRole('navigation', { name: '八阶段开发流程' }).boundingBox())?.width).toBeGreaterThan(200);
    const node = page.getByRole('button', { name: /Strategic DDD/ });
    await node.focus(); await node.press('Enter');
    await expect(page.getByText('这是用于视觉检查的虚构开发文档。')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (process.env.CAPTURE_VISUAL) await page.screenshot({ path: `/private/tmp/dashboard-${browserName}-${viewport.width}.png`, fullPage: true });
    await expect(page.getByRole('navigation', { name: '八阶段开发流程' }).getByRole('button')).toHaveCount(8);
    await expect(page.getByRole('button', { name: /Spec → Architecture \/ ADR → Plan/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑流程' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
