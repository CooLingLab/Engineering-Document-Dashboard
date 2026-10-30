import { expect, test, type Page } from '@playwright/test';

const specPath = 'docs/development/planning/06-spec-plan.md';
const notesPath = 'docs/development/planning/notes.md';
const spec = '# Architecture specification\nA safe read-only stage artifact.';
const notes = '# Unlinked field notes\nNotes belong to the folder, not to a stage yet.';

async function mockProject(page: Page) {
  await page.route('https://api.github.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path === '/repos/fixture/demo') data = { id: 123, name: 'demo', owner: { login: 'fixture' }, default_branch: 'main' };
    else if (path.endsWith('/branches')) data = [{ name: 'main' }];
    else if (path.includes('/commits/')) data = { sha: 'abcde123' };
    else if (path.endsWith('/contents/docs/development')) data = [
      { path: 'docs/development/planning', type: 'dir', sha: 'dirsha', size: 0 },
    ];
    else if (path.endsWith('/contents/docs/development/planning')) data = [
      { path: specPath, type: 'file', sha: 'specsha', size: Buffer.byteLength(spec) },
      { path: notesPath, type: 'file', sha: 'notessha', size: Buffer.byteLength(notes) },
    ];
    else if (path.endsWith('/06-spec-plan.md')) data = {
      type: 'file', path: specPath, sha: 'specsha', size: Buffer.byteLength(spec),
      encoding: 'base64', content: Buffer.from(spec).toString('base64'),
    };
    else if (path.endsWith('/notes.md')) data = {
      type: 'file', path: notesPath, sha: 'notessha', size: Buffer.byteLength(notes),
      encoding: 'base64', content: Buffer.from(notes).toString('base64'),
    };
    else return route.fulfill({ status: 404, json: { message: 'Not Found' } });
    return route.fulfill({ status: 200, json: data });
  });
  await page.goto('/');
  await page.getByLabel('GitHub 仓库地址').fill('fixture/demo');
  await page.getByRole('button', { name: /连接仓库/ }).click();
  await expect(page.getByText('fixture/demo', { exact: true })).toBeVisible();
}

test('desktop stage selection expands its actual document folder and shows a linked Markdown preview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 880 });
  await mockProject(page);
  const stages = page.getByRole('navigation', { name: '八阶段开发流程' });
  await expect(stages.getByRole('button')).toHaveCount(8);
  await stages.getByRole('button', { name: /Spec → Architecture/ }).click();
  const file = page.getByRole('button', { name: `查看文档：${specPath}` });
  await expect(file).toBeVisible();
  await expect(file).toHaveClass(/is-stage-linked/);
  const reader = page.getByRole('region', { name: 'Markdown 文档阅读器' });
  await expect(reader.getByRole('heading', { name: 'Architecture specification' })).toBeVisible();
  await expect(reader.getByLabel('文档路径')).toContainText('planning');
  await page.getByRole('button', { name: `查看文档：${notesPath}` }).click();
  await expect(reader.getByRole('heading', { name: 'Unlinked field notes' })).toBeVisible();
  await expect(reader.getByText(/未关联 · 可在阶段详情中关联/)).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑流程' })).toHaveCount(0);
});

test('mobile switches between stage cards and real folder hierarchy without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockProject(page);
  const stages = page.getByRole('navigation', { name: '八阶段开发流程' });
  await expect(stages.getByRole('button')).toHaveCount(8);
  await page.getByRole('button', { name: '文件目录', exact: true }).click();
  await expect(page.getByRole('tree', { name: '项目文档树' })).toBeVisible();
  await page.getByRole('button', { name: `展开文件夹：docs/development/planning` }).click();
  await page.getByRole('button', { name: `查看文档：${specPath}` }).click();
  await expect(page.getByRole('region', { name: 'Markdown 文档阅读器' })
    .getByRole('heading', { name: 'Architecture specification' })).toBeVisible();
  await page.getByRole('button', { name: '开发阶段', exact: true }).click();
  await expect(stages.getByRole('button')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
