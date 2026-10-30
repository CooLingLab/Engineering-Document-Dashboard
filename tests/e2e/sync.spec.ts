import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test('a second browser session can load a route saved to a separate configuration store', async ({ browser }) => {
  let content: string | null = null;
  let sha = '';
  let writes = 0;
  async function mockGitHub(context: BrowserContext) {
    await context.route('https://api.github.com/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, PUT, OPTIONS', 'access-control-allow-headers': '*' } });
      let body: unknown;
      if (url.pathname === '/repos/fixture/demo') body = { id: 123, name: 'demo', owner: { login: 'fixture' }, default_branch: 'main' };
      else if (url.pathname === '/repos/fixture/config') body = { id: 500, name: 'config', owner: { login: 'fixture' }, default_branch: 'main', private: true };
      else if (url.pathname === '/repos/fixture/demo/branches') body = [{ name: 'main' }];
      else if (url.pathname.includes('/commits/')) body = { sha: 'c1' };
      else if (url.pathname.endsWith('/contents/docs/development')) body = [];
      else if (url.pathname === '/repos/fixture/config/contents/projects/123.json' && request.method() === 'PUT') {
        const input = request.postDataJSON();
        if (content !== null && input.sha !== sha) return route.fulfill({ status: 409, json: {} });
        content = input.content; sha = `version-${++writes}`;
        body = { content: { sha } };
      } else if (url.pathname === '/repos/fixture/config/contents/projects/123.json') {
        if (content === null) return route.fulfill({ status: 404, json: {} });
        body = { type: 'file', sha, encoding: 'base64', content, size: Buffer.from(content, 'base64').length };
      } else if (url.pathname === '/repos/fixture/config/contents') body = [];
      else return route.fulfill({ status: 404, json: {} });
      return route.fulfill({ status: 200, json: body, headers: { 'access-control-allow-origin': '*' } });
    });
  }
  async function connect(page: Page) {
    await page.goto('/');
    await page.getByLabel('GitHub 仓库地址').fill('fixture/demo');
    await page.getByRole('button', { name: /连接仓库/ }).click();
    await expect(page.getByText('fixture/demo', { exact: true })).toBeVisible();
  }
  async function connectStore(page: Page) {
    await page.getByText(/配置同步/).click();
    await page.getByLabel('配置仓库地址').fill('fixture/config');
    await page.getByLabel('配置仓库令牌').fill('synthetic-token');
    await page.getByRole('button', { name: '连接配置仓库' }).click();
  }
  const first = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  try {
    await mockGitHub(first); await mockGitHub(second);
    const page = await first.newPage();
    await connect(page);
    await page.getByLabel('手动状态').selectOption('done');
    await connectStore(page);
    await expect(page.getByText(/尚无配置/)).toBeVisible();
    await page.getByRole('button', { name: '保存到 GitHub' }).click();
    await expect(page.getByText('已保存到 GitHub').first()).toBeVisible();
    expect(writes).toBe(1);
    const other = await second.newPage();
    await connect(other);
    await connectStore(other);
    await expect(other.getByText('已加载 GitHub 上的配置。')).toBeVisible();
    await expect(other.getByLabel('手动状态')).toHaveValue('done');
    expect(writes).toBe(1);
  } finally { await first.close(); await second.close(); }
});
