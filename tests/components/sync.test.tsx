import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SyncPanel } from '../../src/components/SyncPanel';
import { MemoryCredentials } from '../../src/github/credentials';
import { makeConfig } from '../fixtures';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('configuration sync panel', () => {
  it('loads a separate store and saves only after a user action', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === 'PUT') return json({ content: { sha: 'saved' } });
      if (url.pathname === '/repos/example/config-store') return json({ id: 500, name: 'config-store', owner: { login: 'example' }, default_branch: 'main', private: true });
      if (url.pathname.endsWith('/contents/projects/123.json')) return json({}, 404);
      if (url.pathname.endsWith('/contents')) return json([]);
      return json({}, 404);
    });
    const onSaved = vi.fn();
    render(<SyncPanel config={makeConfig()} dirty credentials={new MemoryCredentials()} fetcher={fetcher} onLoaded={vi.fn(async () => true)} onSaved={onSaved} />);
    fireEvent.click(screen.getByText(/配置同步/));
    fireEvent.change(screen.getByLabelText('配置仓库地址'), { target: { value: 'example/config-store' } });
    fireEvent.change(screen.getByLabelText('配置仓库令牌'), { target: { value: 'synthetic-token' } });
    fireEvent.click(screen.getByRole('button', { name: '连接配置仓库' }));
    await screen.findByText(/尚无配置/);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '保存到 GitHub' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });

  it('allows the user to reject a public configuration repository before reading or writing it', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/repos/example/config-store') return json({ id: 500, name: 'config-store', owner: { login: 'example' }, default_branch: 'main', private: false });
      return json({}, 404);
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SyncPanel config={makeConfig()} dirty={false} credentials={new MemoryCredentials()} fetcher={fetcher} onLoaded={vi.fn(async () => true)} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText(/配置同步/));
    fireEvent.change(screen.getByLabelText('配置仓库地址'), { target: { value: 'example/config-store' } });
    fireEvent.change(screen.getByLabelText('配置仓库令牌'), { target: { value: 'synthetic-token' } });
    fireEvent.click(screen.getByRole('button', { name: '连接配置仓库' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/contents'))).toBe(true);
    expect(screen.queryByRole('button', { name: '保存到 GitHub' })).not.toBeInTheDocument();
    confirm.mockRestore();
  });
  it('locks the store if a newly read remote configuration cannot be applied', async () => {
    let remoteExists = false;
    const content = JSON.stringify(makeConfig());
    const bytes = new TextEncoder().encode(content);
    const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === 'PUT') return json({ content: { sha: 'written' } });
      if (url.pathname === '/repos/example/config-store') return json({ id: 500, name: 'config-store', owner: { login: 'example' }, default_branch: 'main', private: true });
      if (url.pathname.endsWith('/contents/projects/123.json')) return remoteExists ? json({ type: 'file', sha: 'remote-sha', size: bytes.length, encoding: 'base64', content: encoded }) : json({}, 404);
      if (url.pathname.endsWith('/contents')) return json([]);
      return json({}, 404);
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SyncPanel config={makeConfig()} dirty credentials={new MemoryCredentials()} fetcher={fetcher} onLoaded={vi.fn(async () => false)} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText(/配置同步/));
    fireEvent.change(screen.getByLabelText('配置仓库地址'), { target: { value: 'example/config-store' } });
    fireEvent.change(screen.getByLabelText('配置仓库令牌'), { target: { value: 'synthetic-token' } });
    fireEvent.click(screen.getByRole('button', { name: '连接配置仓库' }));
    await screen.findByText(/尚无配置/);
    remoteExists = true;
    fireEvent.click(screen.getByRole('button', { name: '重新读取配置' }));
    await screen.findByText(/无法应用远端配置/);
    expect(screen.queryByRole('button', { name: '保存到 GitHub' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    confirm.mockRestore();
  });
});
