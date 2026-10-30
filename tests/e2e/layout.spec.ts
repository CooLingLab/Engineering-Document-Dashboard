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
      else if (url.pathname.endsWith('/contents/docs/development')) body = [{ path: 'docs/development/02-requirements.md', sha: 'b1', size: Buffer.byteLength(doc), type: 'file' }];
      else if (url.pathname.endsWith('/02-requirements.md')) body = { path: 'docs/development/02-requirements.md', sha: 'b1', size: Buffer.byteLength(doc), type: 'file', encoding: 'base64', content: Buffer.from(doc).toString('base64') };
      else return route.fulfill({ status: 404, json: {} });
      return route.fulfill({ status: 200, json: body });
    });
    await page.goto('/');
    await page.getByLabel('GitHub 仓库地址').fill('fixture/demo');
    await page.getByRole('button', { name: /连接仓库/ }).click();
    await expect(page.getByRole('heading', { name: '你的开发路线' })).toBeVisible();
    if (viewport.width < 700) expect((await page.getByRole('navigation', { name: '选择开发环节' }).boundingBox())?.width).toBeGreaterThan(200);
    const node = page.getByRole('button', { name: '查看需求' });
    await node.focus(); await node.press('Enter');
    await expect(page.getByText('这是用于视觉检查的虚构开发文档。')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (process.env.CAPTURE_VISUAL) await page.screenshot({ path: `/private/tmp/dashboard-${browserName}-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: '编辑流程' }).click();
    const longTitle = '这是一个用于检查中文长标题换行和开发流程显示的测试环节';
    if (viewport.width < 700) {
      // The phone editor uses a list and a tap-to-add form instead of the desktop canvas form.
      await page.getByRole('button', { name: '＋ 添加新环节' }).click();
      await page.locator('.mobile-add-form').getByLabel('新环节名称').fill(longTitle);
      await page.locator('.mobile-add-form').getByRole('button', { name: '添加', exact: true }).click();
      await expect(page.locator('.mobile-stage-list').getByText(longTitle, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '流程图预览' }).click();
      await expect(page.locator('.mobile-graph-preview .react-flow__node').filter({ hasText: longTitle })).toHaveCount(1);
    } else {
      await page.getByLabel('新环节名称').fill(longTitle);
      await page.getByRole('button', { name: '添加环节' }).click();
      await expect(page.locator('.react-flow__node').filter({ hasText: longTitle })).toHaveCount(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
