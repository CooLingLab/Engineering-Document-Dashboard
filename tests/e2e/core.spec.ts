import { expect, test } from '@playwright/test';

test('private repository credentials remain in memory and branch statuses stay separate', async ({ page }) => {
  const token = 'synthetic-private-token';
  const document = '# 需求\n私人示例正文';
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*' } });
    if (request.headers().authorization !== `Bearer ${token}`) return route.fulfill({ status: 404, json: {} });
    let body: unknown;
    if (url.pathname === '/repos/fixture/private') body = { id: 123, name: 'private', owner: { login: 'fixture' }, default_branch: 'main' };
    else if (url.pathname.endsWith('/branches')) body = [{ name: 'main' }, { name: 'feature' }];
    else if (url.pathname.includes('/commits/')) body = { sha: url.pathname.endsWith('/feature') ? 'feature-sha' : 'main-sha' };
    else if (url.pathname.endsWith('/contents/docs/development')) body = [{ type: 'file', path: 'docs/development/02-requirements.md', sha: 'blob', size: Buffer.byteLength(document) }];
    else if (url.pathname.endsWith('/02-requirements.md')) body = { type: 'file', path: 'docs/development/02-requirements.md', sha: 'blob', size: Buffer.byteLength(document), encoding: 'base64', content: Buffer.from(document).toString('base64') };
    else return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ status: 200, json: body, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await page.getByLabel('GitHub 仓库地址').fill('fixture/private');
  await page.getByText('私有仓库授权（可选）').click();
  await page.getByLabel('GitHub 读取令牌').fill(token);
  await page.getByRole('button', { name: /连接仓库/ }).click();
  await page.getByRole('button', { name: '查看需求' }).focus();
  await page.getByRole('button', { name: '查看需求' }).press('Enter');
  await expect(page.getByText('私人示例正文')).toBeVisible();
  await page.getByLabel('手动状态').selectOption('done');
  await page.getByLabel('当前分支').selectOption('feature');
  await expect(page.getByLabel('手动状态')).toHaveValue('');
  await page.getByLabel('当前分支').selectOption('main');
  await expect(page.getByLabel('手动状态')).toHaveValue('done');
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
  expect(storage).not.toContain(token);
  expect(storage).not.toContain('私人示例正文');
});

test('an initially empty repository can discover its first branch without losing draft edits', async ({ page }) => {
  let hasCommit = false;
  await page.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    if (url.pathname === '/repos/fixture/empty') body = { id: 456, name: 'empty', owner: { login: 'fixture' }, default_branch: 'main' };
    else if (url.pathname.endsWith('/branches')) body = hasCommit ? [{ name: 'main' }] : [];
    else if (url.pathname.includes('/commits/')) body = { sha: 'new-commit' };
    else if (url.pathname.endsWith('/contents/docs/development')) body = [];
    else return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ status: 200, json: body });
  });
  await page.goto('/');
  await page.getByLabel('GitHub 仓库地址').fill('fixture/empty');
  await page.getByRole('button', { name: /连接仓库/ }).click();
  await expect(page.getByLabel('当前分支')).toHaveValue('');
  await page.getByRole('button', { name: '编辑流程' }).click();
  await page.getByLabel('新环节名称').fill('复盘');
  await page.getByRole('button', { name: '添加环节' }).click();
  hasCommit = true;
  await page.getByRole('button', { name: '刷新文档' }).click();
  await expect(page.getByLabel('当前分支')).toHaveValue('main');
  await expect(page.getByRole('button', { name: '查看复盘' })).toBeVisible();
  await expect(page.getByText('当前项目 · 有未同步修改')).toBeVisible();
});
