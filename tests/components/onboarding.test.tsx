import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/app/App';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});

describe('first project connection', () => {
  it('shows the route first and selected stage details after reading the project', async () => {
    const text = '# 领域模型\n用户希望记录一本书。';
    const bytes = new TextEncoder().encode(text);
    const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/repos/example/project') return json({ id: 123, name: 'project', owner: { login: 'example' }, default_branch: 'main' });
      if (url.pathname.endsWith('/branches')) return json([{ name: 'main' }]);
      if (url.pathname.includes('/commits/')) return json({ sha: 'c1' });
      if (url.pathname.endsWith('/contents/docs/development')) return json([
        { path: 'docs/development/02-domain.md', sha: 'blob-1', size: bytes.length, type: 'file' },
      ]);
      if (url.pathname.endsWith('/02-domain.md')) return json({
        path: 'docs/development/02-domain.md', sha: 'blob-1', size: bytes.length, type: 'file', encoding: 'base64', content: encoded,
      });
      return json({ message: 'Not Found' }, 404);
    });
    vi.stubGlobal('fetch', fetcher);
    render(<App />);
    expect(screen.getByRole('heading', { name: /开发路线/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/GitHub 仓库/), { target: { value: 'example/project' } });
    fireEvent.click(screen.getByRole('button', { name: /连接仓库/ }));
    expect(await screen.findByText('example/project')).toBeInTheDocument();
    expect(screen.getByLabelText('当前分支')).toHaveValue('main');
    expect(screen.queryByLabelText(/GitHub 仓库/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更换项目' }));
    expect(screen.getByLabelText(/GitHub 仓库/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起连接' }));
    expect(screen.getByText(/建议补充/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Strategic DDD/ }));
    const details = screen.getByRole('region', { name: 'Strategic DDD详情' });
    const reader = screen.getByRole('region', { name: 'Markdown 文档阅读器' });
    expect(within(reader).getByText('用户希望记录一本书。')).toBeInTheDocument();
    expect(within(details).getByText(/统一语言和业务边界/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /新手模式/ }));
    expect(within(details).queryByText(/统一语言和业务边界/)).not.toBeInTheDocument();
    expect(within(reader).getByText('用户希望记录一本书。')).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: '复制 prompt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑流程' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /未判断/ })).toHaveLength(8);
    fireEvent.change(within(details).getByRole('combobox', { name: '手动状态' }), { target: { value: 'skipped' } });
    expect(within(details).getByText(/不会被视为已完成/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/修改文档目录/));
    fireEvent.change(screen.getByLabelText('文档目录'), { target: { value: 'docs/other' } });
    fireEvent.click(screen.getByRole('button', { name: '应用目录' }));
    expect(await screen.findByText(/未找到文档目录/)).toBeInTheDocument();
  }, 10_000);

  it('distinguishes an inaccessible repository from missing documents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Not Found' }, 404)));
    render(<App />);
    fireEvent.change(screen.getByLabelText(/GitHub 仓库/), { target: { value: 'example/private' } });
    fireEvent.click(screen.getByRole('button', { name: /连接仓库/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/不存在|无法访问/));
    expect(screen.queryByText(/建议补充/)).not.toBeInTheDocument();
  });

  it('keeps unsynced edits when the user declines to switch projects', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/repos/example/project') return json({ id: 123, name: 'project', owner: { login: 'example' }, default_branch: 'main' });
      if (url.pathname.endsWith('/branches')) return json([{ name: 'main' }]);
      if (url.pathname.includes('/commits/')) return json({ sha: 'c1' });
      if (url.pathname.includes('/contents/')) return json([]);
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetcher);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    fireEvent.change(screen.getByLabelText(/GitHub 仓库/), { target: { value: 'example/project' } });
    fireEvent.click(screen.getByRole('button', { name: /连接仓库/ }));
    await screen.findByText('example/project');
    fireEvent.change(screen.getByRole('combobox', { name: '手动状态' }), { target: { value: 'in-progress' } });
    expect(screen.getAllByText(/有未同步修改/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '更换项目' }));
    fireEvent.change(screen.getByLabelText(/GitHub 仓库/), { target: { value: 'example/other' } });
    const count = fetcher.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /连接仓库/ }));
    expect(confirm).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(count);
    expect(screen.getByRole('combobox', { name: '手动状态' })).toHaveValue('in-progress');
    confirm.mockRestore();
  });
});
