import { describe, expect, it, vi } from 'vitest';
import { loadDocumentSnapshot } from '../../src/documents/index';
import { GitHubError, GitHubReader } from '../../src/github/client';
import { MemoryCredentials } from '../../src/github/credentials';
import { makeSnapshot } from '../fixtures';

const repo = makeSnapshot().repository;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const repoPayload = { id: 123, name: 'project', owner: { login: 'example' }, default_branch: 'main' };
const entry = (path: string, type: 'file' | 'dir' | 'symlink', size = 4) => ({ path, type, sha: 'blob-1', size });
const file = (path: string, content = 'text', size = content.length) => ({
  type: 'file', path, sha: 'blob-1', size, encoding: 'base64', content: btoa(content),
});
const reader = (fetcher: typeof fetch) => new GitHubReader({ fetcher, credentials: new MemoryCredentials(), credentialSlot: 'target' });

describe('reading the selected documentation folder', () => {
  it('reads only Markdown inside the selected directory from a fixed commit', async () => {
    const urls: URL[] = [];
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const url = new URL(String(input)); urls.push(url);
      if (url.pathname.includes('/commits/')) return json({ sha: 'c1' });
      if (url.pathname.endsWith('/contents/docs/development')) return json([
        entry('docs/development/01-vision.md', 'file'), entry('docs/development/nested', 'dir'),
        entry('docs/development/link.md', 'symlink'), entry('docs/development/app.ts', 'file'),
        entry('README.md', 'file'),
      ]);
      if (url.pathname.endsWith('/contents/docs/development/nested')) return json([
        entry('docs/development/nested/02-requirements.md', 'file'),
      ]);
      if (url.pathname.endsWith('.md')) return json(file(decodeURIComponent(url.pathname.split('/contents/')[1])));
      throw new Error('不应访问其他路径');
    });
    const snapshot = await loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development');
    expect(snapshot.ref).toEqual({ name: 'main', commitSha: 'c1' });
    expect(snapshot.documents.map((item) => item.path)).toEqual([
      'docs/development/01-vision.md', 'docs/development/nested/02-requirements.md',
    ]);
    expect(urls.filter((url) => url.pathname.includes('/contents')).every((url) => url.searchParams.get('ref') === 'c1')).toBe(true);
    expect(urls.some((url) => /README|link\.md|app\.ts/.test(url.pathname))).toBe(false);
  });

  it('reports a missing directory only after rechecking the repository and branch', async () => {
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes('/commits/')) return json({ sha: 'c1' });
      if (path.endsWith('/repos/example/project')) return json(repoPayload);
      return json({ message: 'Not Found' }, 404);
    });
    const snapshot = await loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development');
    expect(snapshot.issues).toEqual([{ path: 'docs/development', kind: 'missing', message: expect.any(String) }]);
  });

  it('does not confuse lost private repository access with a missing directory', async () => {
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes('/commits/')) return json({ sha: 'c1' });
      return json({ message: 'Not Found' }, 404);
    });
    await expect(loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development'))
      .rejects.toMatchObject({ kind: 'not-found-or-no-access' });
  });

  it('flags oversized files and does not request their contents', async () => {
    const urls: string[] = [];
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const path = new URL(String(input)).pathname; urls.push(path);
      if (path.includes('/commits/')) return json({ sha: 'c1' });
      return json([entry('docs/development/02-requirements.md', 'file', 200 * 1024 + 1)]);
    });
    const snapshot = await loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development');
    expect(snapshot.issues).toEqual([expect.objectContaining({ kind: 'too-large' })]);
    expect(snapshot.documents).toEqual([]);
    expect(urls.some((url) => url.endsWith('02-requirements.md'))).toBe(false);
  });

  it('marks a scan incomplete when the directory listing reaches its GitHub limit', async () => {
    const fetcher: typeof fetch = vi.fn(async (input) => {
      if (new URL(String(input)).pathname.includes('/commits/')) return json({ sha: 'c1' });
      return json(Array.from({ length: 1000 }, (_, index) => entry(`docs/development/file-${index}.txt`, 'file')));
    });
    const snapshot = await loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development');
    expect(snapshot.issues).toContainEqual(expect.objectContaining({ kind: 'incomplete' }));
  });

  it('stops before reading a 201st Markdown document', async () => {
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes('/commits/')) return json({ sha: 'c1' });
      if (path.endsWith('/contents/docs/development')) return json(
        Array.from({ length: 201 }, (_, index) => entry(`docs/development/file-${index}.md`, 'file', 1)),
      );
      return json(file(decodeURIComponent(path.split('/contents/')[1]), 'x'));
    });
    const snapshot = await loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development');
    expect(snapshot.documents).toHaveLength(200);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({ kind: 'incomplete' }));
    expect(fetcher).toHaveBeenCalledTimes(202);
  });

  it('reports an incomplete scan before exceeding the 2 MiB total limit', async () => {
    const content = 'x'.repeat(200 * 1024);
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes('/commits/')) return json({ sha: 'c1' });
      if (path.endsWith('/contents/docs/development')) return json(
        Array.from({ length: 11 }, (_, index) => entry(`docs/development/file-${index}.md`, 'file', content.length)),
      );
      return json(file(decodeURIComponent(path.split('/contents/')[1]), content));
    });
    const snapshot = await loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development');
    expect(snapshot.documents).toHaveLength(10);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({ kind: 'incomplete' }));
  });

  it('rejects traversal paths before requesting any repository data', async () => {
    const fetcher = vi.fn(async () => json({}));
    await expect(loadDocumentSnapshot(reader(fetcher), repo, 'main', '../private')).rejects.toThrow(/文档目录/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('propagates cancellation without reporting a completed scan', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn(async () => json({ sha: 'c1' }));
    await expect(loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('stops rather than returning a partial snapshot on an API rate limit', async () => {
    const fetcher: typeof fetch = vi.fn(async (input) => {
      if (new URL(String(input)).pathname.includes('/commits/')) return json({ sha: 'c1' });
      return new Response('limited', { status: 429 });
    });
    await expect(loadDocumentSnapshot(reader(fetcher), repo, 'main', 'docs/development')).rejects.toBeInstanceOf(GitHubError);
  });
});
