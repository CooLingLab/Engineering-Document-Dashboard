import { describe, expect, it, vi } from 'vitest';
import { ConfigRepositoryGateway } from '../../src/config/repository';
import { MemoryCredentials } from '../../src/github/credentials';
import { makeConfig } from '../fixtures';

const source = () => ({ repository: { id: 500, owner: 'example', name: 'config-store', defaultBranch: 'main' }, branch: 'main' });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function setup(fetcher: typeof fetch) {
  const credentials = new MemoryCredentials();
  credentials.set('config', 'synthetic-config-token');
  return new ConfigRepositoryGateway(source(), { credentials, fetcher });
}
const metadata = response({ id: 500, private: true, default_branch: 'main' });
function file(content: string, sha = 'current-sha') {
  const bytes = new TextEncoder().encode(content);
  return { type: 'file', sha, size: bytes.length, encoding: 'base64', content: btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')) };
}

describe('configuration repository gateway', () => {
  it('writes only to the separate configuration repository with expected SHA and no secret', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === 'PUT'
      ? response({ content: { sha: 'new-sha' } }) : metadata.clone());
    const gateway = setup(fetcher);
    expect(await gateway.saveConfiguration(makeConfig(), 'previous-sha')).toEqual({ kind: 'saved', fileSha: 'new-sha' });
    const [url, init] = fetcher.mock.calls.find(([, options]) => options?.method === 'PUT')!;
    expect(String(url)).toContain('/repos/example/config-store/contents/projects/123.json');
    const body = JSON.parse(String(init?.body));
    expect(body.sha).toBe('previous-sha');
    expect(body.message).toBe('chore: 更新开发路线配置');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-config-token');
    expect(atob(body.content)).not.toContain('synthetic-config-token');
  });

  it('loads a saved configuration on another device and treats an authenticated missing file as new', async () => {
    const config = makeConfig();
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/contents/')
      ? response(file(JSON.stringify(config))) : metadata.clone());
    const gateway = setup(fetcher);
    expect(await gateway.loadConfiguration(123)).toEqual({ config, fileSha: 'current-sha', unsupportedVersion: null });
    fetcher.mockImplementation(async (url) => String(url).includes('/contents/') ? response({}, 404)
      : String(url).endsWith('/contents?ref=main') ? response([]) : metadata.clone());
    expect(await gateway.loadConfiguration(123)).toEqual({ config: null, fileSha: null, unsupportedVersion: null });
  });

  it('refuses to write to the target and reports an optimistic concurrency conflict', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === 'PUT' ? response({}, 409) : metadata.clone());
    const gateway = setup(fetcher);
    expect(await gateway.saveConfiguration(makeConfig(), 'old')).toEqual({ kind: 'conflict' });
    await expect(gateway.saveConfiguration(makeConfig({ repository: source().repository }), null)).rejects.toThrow(/独立/);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });

  it('does not overwrite an unsupported future version', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/contents/')
      ? response(file(JSON.stringify({ schemaVersion: 99 }))) : metadata.clone());
    expect(await setup(fetcher).loadConfiguration(123)).toEqual({ config: null, fileSha: 'current-sha', unsupportedVersion: 99 });
  });

  it('does not mistake a missing or inaccessible branch for a missing configuration file', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/contents') ? response({}, 404) : metadata.clone());
    await expect(setup(fetcher).loadConfiguration(123)).rejects.toThrow(/无法确认/);
  });
  it('recognizes GitHub’s 404 contents and 409 commits responses for an empty configuration repository', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return response({ content: { sha: 'first' } }, 201);
      if (String(url).includes('/contents')) return response({ message: 'This repository is empty.' }, 404);
      if (String(url).includes('/commits')) return response({}, 409);
      return metadata.clone();
    });
    const gateway = setup(fetcher);
    expect((await gateway.loadConfiguration(123)).config).toBeNull();
    expect(await gateway.saveConfiguration(makeConfig(), null)).toEqual({ kind: 'saved', fileSha: 'first' });
    const [, options] = fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(JSON.parse(String(options?.body))).not.toHaveProperty('branch');
    expect(gateway.source.branch).toBe('main');
  });

  it('loads a large-file response through its immutable blob SHA', async () => {
    const config = makeConfig();
    const sha = 'a'.repeat(40);
    const blob = file(JSON.stringify(config), sha);
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/git/blobs/')) return response(blob);
      if (String(url).includes('/contents/')) return response({ type: 'file', sha, size: blob.size, encoding: 'none', content: '' });
      return metadata.clone();
    });
    expect((await setup(fetcher).loadConfiguration(123)).config).toEqual(config);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes(`/git/blobs/${sha}`))).toBe(true);
  });

  it('lets a second device detect a conflicting update without replacing it', async () => {
    let currentSha = 'original';
    let currentText = JSON.stringify(makeConfig());
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        if (body.sha !== currentSha) return response({}, 409);
        currentSha = 'changed';
        currentText = new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)));
        return response({ content: { sha: currentSha } });
      }
      if (String(url).includes('/contents/')) return response(file(currentText, currentSha));
      return metadata.clone();
    });
    const first = setup(fetcher);
    const second = setup(fetcher);
    const [one, two] = await Promise.all([first.loadConfiguration(123), second.loadConfiguration(123)]);
    const edited = makeConfig();
    edited.graph.nodes[0].title = '设备一';
    expect(await first.saveConfiguration(edited, one.fileSha)).toEqual({ kind: 'saved', fileSha: 'changed' });
    expect(await second.saveConfiguration(makeConfig(), two.fileSha)).toEqual({ kind: 'conflict' });
    expect(JSON.parse(currentText).graph.nodes[0].title).toBe('设备一');
  });

  it('verifies a timed-out write by reading the remote without a second PUT', async () => {
    let contents = '';
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') { contents = String(JSON.parse(String(init.body)).content); throw new TypeError('network'); }
      if (String(url).includes('/contents/')) return response({ type: 'file', sha: 'written-sha', encoding: 'base64', content: contents, size: Uint8Array.from(atob(contents), (c) => c.charCodeAt(0)).length });
      return metadata.clone();
    });
    expect(await setup(fetcher).saveConfiguration(makeConfig(), null)).toEqual({ kind: 'saved', fileSha: 'written-sha' });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });

  it('treats a server error after writing as uncertain until the remote is checked', async () => {
    let contents = '';
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') { contents = String(JSON.parse(String(init.body)).content); return response({}, 500); }
      if (String(url).includes('/contents/')) return response({ type: 'file', sha: 'written-sha', encoding: 'base64', content: contents, size: Uint8Array.from(atob(contents), (c) => c.charCodeAt(0)).length });
      return metadata.clone();
    });
    expect(await setup(fetcher).saveConfiguration(makeConfig(), null)).toEqual({ kind: 'saved', fileSha: 'written-sha' });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });
});
