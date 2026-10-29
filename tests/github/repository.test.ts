import { describe, expect, it, vi } from 'vitest';
import { MemoryCredentials } from '../../src/github/credentials';
import { GitHubError, GitHubReader } from '../../src/github/client';
import { parseRepositoryInput } from '../../src/github/repository';
import type { Repository } from '../../src/domain/project';

const repo: Repository = { id: 123, owner: 'acme', name: 'demo', defaultBranch: 'main' };
const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  ...init, headers: { 'content-type': 'application/json', ...init.headers },
});
const repoPayload = { id: 123, name: 'demo', owner: { login: 'acme' }, default_branch: 'main' };

describe('GitHub repository address', () => {
  it('accepts GitHub repository roots without allowing embedded credentials or extra paths', () => {
    expect(parseRepositoryInput('https://github.com/acme/demo.git')).toEqual({ owner: 'acme', name: 'demo' });
    expect(parseRepositoryInput('acme/demo')).toEqual({ owner: 'acme', name: 'demo' });
    for (const value of [
      'https://github.com.evil.test/acme/demo', 'https://github.com/acme/demo/tree/main',
      'https://user:pass@github.com/acme/demo', 'https://github.com/acme/demo?token=abc',
      'http://github.com/acme/demo', 'https://github.com:444/acme/demo',
    ]) expect(() => parseRepositoryInput(value)).toThrow();
  });
});

describe('GitHub reader', () => {
  it('calls browser fetch with the global receiver required by native implementations', async () => {
    const fetcher: typeof fetch = async function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return json(repoPayload);
    };
    const reader = new GitHubReader({ fetcher, credentials: new MemoryCredentials(), credentialSlot: 'target' });
    await expect(reader.getRepository({ owner: 'acme', name: 'demo' })).resolves.toEqual(repo);
  });

  it('reads public data without a token and keeps subsequent requests pinned to one commit', async () => {
    const requests: { url: URL; init: RequestInit }[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init: init ?? {} });
      if (url.pathname === '/repos/acme/demo') return json(repoPayload);
      if (url.pathname.includes('/commits/')) return json({ sha: 'c1' });
      return json([{ path: 'docs/development/a.md', type: 'file', sha: 'b1', size: 8 }]);
    });
    const reader = new GitHubReader({ fetcher, credentials: new MemoryCredentials(), credentialSlot: 'target' });

    expect(await reader.getRepository({ owner: 'acme', name: 'demo' })).toEqual(repo);
    const ref = await reader.resolveRef(repo, 'feature/登录#2');
    expect(ref).toEqual({ name: 'feature/登录#2', commitSha: 'c1' });
    await reader.listDirectory(repo, 'docs/development', ref!.commitSha);
    expect(requests[1].url.pathname).toContain('feature%2F');
    expect(requests[1].url.pathname).toContain('%23');
    expect(requests[2].url.searchParams.get('ref')).toBe('c1');
    expect(requests.every(({ url }) => url.origin === 'https://api.github.com')).toBe(true);
    expect(requests.every(({ init }) => (init.method ?? 'GET') === 'GET')).toBe(true);
    expect(new Headers(requests[0].init.headers).has('Authorization')).toBe(false);
  });

  it('follows only GitHub branch pagination and uses the selected in-memory token', async () => {
    const requests: { url: URL; headers: Headers }[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url.searchParams.get('page') === '2') return json([{ name: 'feature/登录#2' }]);
      return json([{ name: 'main' }], { headers: {
        link: '<https://api.github.com/repos/acme/demo/branches?page=2>; rel="next"',
      } });
    });
    const credentials = new MemoryCredentials();
    credentials.set('target', 'target-example-secret');
    credentials.set('config', 'config-example-secret');
    const reader = new GitHubReader({ fetcher, credentials, credentialSlot: 'target' });

    expect(await reader.listBranches(repo)).toEqual(['main', 'feature/登录#2']);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.headers.get('Authorization') === 'Bearer target-example-secret')).toBe(true);
  });

  it('rejects a malicious pagination link before sending credentials', async () => {
    const fetcher = vi.fn(async () => json([{ name: 'main' }], { headers: {
      link: '<https://evil.example/collect>; rel="next"',
    } }));
    const credentials = new MemoryCredentials();
    credentials.set('target', 'target-example-secret');
    const reader = new GitHubReader({ fetcher, credentials, credentialSlot: 'target' });
    await expect(reader.listBranches(repo)).rejects.toBeInstanceOf(GitHubError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('decodes UTF-8 file content while retaining its source path and blob SHA', async () => {
    const bytes = new TextEncoder().encode('# 需求\n完成登录');
    const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
    const fetcher: typeof fetch = vi.fn(async () => json({
      type: 'file', path: 'docs/development/02-requirements.md', sha: 'blob-1',
      size: bytes.length, encoding: 'base64', content: encoded,
    }));
    const reader = new GitHubReader({ fetcher, credentials: new MemoryCredentials(), credentialSlot: 'target' });
    expect(await reader.readFile(repo, 'docs/development/02-requirements.md', 'c1')).toEqual({
      path: 'docs/development/02-requirements.md', blobSha: 'blob-1', size: bytes.length, content: '# 需求\n完成登录',
    });
  });

  it.each([
    [401, {}, 'unauthorized'], [403, {}, 'forbidden'], [404, {}, 'not-found-or-no-access'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate-limited'], [429, { 'retry-after': '60' }, 'rate-limited'],
  ] as const)('classifies HTTP %i without exposing server response content', async (status, headers, kind) => {
    const fetcher: typeof fetch = vi.fn(async () => new Response('target-example-secret', { status, headers }));
    const reader = new GitHubReader({ fetcher, credentials: new MemoryCredentials(), credentialSlot: 'target' });
    const result = await reader.getRepository({ owner: 'acme', name: 'demo' }).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(GitHubError);
    if (!(result instanceof GitHubError)) throw new Error('预期 GitHubError');
    expect(result.kind).toBe(kind);
    expect(result.message).not.toContain('target-example-secret');
  });

  it('represents an empty repository without treating it as a permission failure', async () => {
    const fetcher: typeof fetch = vi.fn(async () => json({ message: 'Git Repository is empty.' }, { status: 409 }));
    const reader = new GitHubReader({ fetcher, credentials: new MemoryCredentials(), credentialSlot: 'target' });
    await expect(reader.resolveRef(repo, 'main')).resolves.toBeNull();
  });

  it('treats a secondary rate limit with Retry-After as temporary, not an authorization failure', async () => {
    const fetcher: typeof fetch = vi.fn(async () => new Response('limited', {
      status: 403, headers: { 'retry-after': '60', 'x-ratelimit-remaining': '42' },
    }));
    const reader = new GitHubReader({ fetcher, credentials: new MemoryCredentials(), credentialSlot: 'target' });
    const result = await reader.getRepository({ owner: 'acme', name: 'demo' }).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(GitHubError);
    if (!(result instanceof GitHubError)) throw new Error('预期 GitHubError');
    expect(result.kind).toBe('rate-limited');
    expect(result.retryAt).toBeGreaterThan(Date.now() + 50_000);
  });
});
