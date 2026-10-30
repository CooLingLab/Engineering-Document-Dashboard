import type { BranchRef, DocumentFile, Repository } from '../domain/project';
import type { MemoryCredentials } from './credentials';
import type { RepositoryInput } from './repository';

export type GitHubErrorKind = 'unauthorized' | 'forbidden' | 'not-found-or-no-access' | 'rate-limited' | 'network' | 'empty-repository';
export type GitHubEntry = { path: string; type: 'file' | 'dir' | 'symlink' | 'submodule'; sha: string; size: number };

export class GitHubError extends Error {
  constructor(public kind: GitHubErrorKind, message: string, public retryAt?: number) {
    super(message);
    this.name = 'GitHubError';
  }
}

const API_ORIGIN = 'https://api.github.com';

function repoPath(repo: RepositoryInput): string {
  return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

function encodePath(path: string): string {
  if (!path) return '';
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\\0]/.test(segment))) {
    throw new GitHubError('network', '文件路径无效。');
  }
  return '/' + segments.map(encodeURIComponent).join('/');
}

export class GitHubReader {
  #options: { fetcher: typeof fetch; credentials: MemoryCredentials; credentialSlot: 'target' | 'config' };
  #queue: Promise<unknown> = Promise.resolve();
  #cache = new Map<string, { etag: string; value: unknown; headers: Headers }>();
  #cacheVersion = -1;
  #unsubscribe: () => void;

  constructor(options: { fetcher: typeof fetch; credentials: MemoryCredentials; credentialSlot: 'target' | 'config' }) {
    this.#options = options;
    this.#unsubscribe = options.credentials.onChange((slot) => { if (slot === options.credentialSlot) this.#cache.clear(); });
  }

  dispose(): void { this.#unsubscribe(); this.#cache.clear(); }

  #request(url: URL, signal: AbortSignal | undefined, etag: string | undefined, version: number): Promise<Response> {
    const pending = this.#queue.then(() => this.#doRequest(url, signal, etag, version));
    this.#queue = pending.catch(() => undefined);
    return pending;
  }

  async #doRequest(url: URL, signal: AbortSignal | undefined, etag: string | undefined, version: number): Promise<Response> {
    if (url.origin !== API_ORIGIN || url.username || url.password) throw new GitHubError('network', 'GitHub API 地址无效。');
    if (signal?.aborted || this.#options.credentials.version(this.#options.credentialSlot) !== version) throw new DOMException('请求已取消', 'AbortError');
    const headers = new Headers({ Accept: 'application/vnd.github+json' });
    if (etag) headers.set('If-None-Match', etag);
    const token = this.#options.credentials.get(this.#options.credentialSlot);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response: Response;
    try {
      response = await this.#options.fetcher.call(globalThis, url.toString(), { method: 'GET', headers, signal, redirect: 'error' });
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      throw new GitHubError('network', '无法连接 GitHub，请检查网络。');
    }
    if (response.url && new URL(response.url).origin !== API_ORIGIN) throw new GitHubError('network', 'GitHub 返回了不受支持的跳转。');
    if (signal?.aborted || this.#options.credentials.version(this.#options.credentialSlot) !== version) throw new DOMException('请求已取消', 'AbortError');
    if (response.ok || response.status === 304) return response;
    if (response.status === 401) throw new GitHubError('unauthorized', 'GitHub 授权无效或已过期。');
    if (response.status === 429 || (response.status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      const retryAt = retryAfter > 0 ? Date.now() + retryAfter * 1000 : reset > 0 ? reset * 1000 : undefined;
      throw new GitHubError('rate-limited', 'GitHub 请求达到限制，请稍后重试。', retryAt);
    }
    if (response.status === 403) throw new GitHubError('forbidden', '当前凭据没有访问权限。');
    if (response.status === 404) throw new GitHubError('not-found-or-no-access', '仓库或文件不存在，或当前凭据无法访问。');
    if (response.status === 409) throw new GitHubError('empty-repository', '仓库尚无可读取的提交。');
    throw new GitHubError('network', `GitHub 请求失败（${response.status}）。`);
  }

  async #json(url: URL, signal?: AbortSignal): Promise<{ value: unknown; response: Response }> {
    const version = this.#options.credentials.version(this.#options.credentialSlot);
    if (version !== this.#cacheVersion) { this.#cache.clear(); this.#cacheVersion = version; }
    const key = url.toString();
    const cached = this.#cache.get(key);
    const response = await this.#request(url, signal, cached?.etag, version);
    if (signal?.aborted || this.#options.credentials.version(this.#options.credentialSlot) !== version) throw new DOMException('请求已取消', 'AbortError');
    if (response.status === 304) {
      if (!cached) throw new GitHubError('network', 'GitHub 返回了无法验证的缓存响应。');
      return { value: cached.value, response: new Response(null, { status: 200, headers: cached.headers }) };
    }
    try {
      const value: unknown = await response.json();
      if (signal?.aborted || this.#options.credentials.version(this.#options.credentialSlot) !== version) throw new DOMException('请求已取消', 'AbortError');
      const etag = response.headers.get('etag');
      if (etag) {
        if (this.#cache.size >= 512) this.#cache.delete(this.#cache.keys().next().value!);
        this.#cache.set(key, { etag, value, headers: new Headers(response.headers) });
      } else this.#cache.delete(key);
      return { value, response };
    }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new GitHubError('network', 'GitHub 返回的数据无法读取。'); }
  }

  async getRepository(input: RepositoryInput, signal?: AbortSignal): Promise<Repository> {
    const { value } = await this.#json(new URL(repoPath(input), API_ORIGIN), signal);
    const data = value as { id?: unknown; name?: unknown; owner?: { login?: unknown }; default_branch?: unknown };
    if (typeof data?.id !== 'number' || typeof data.name !== 'string' || typeof data.owner?.login !== 'string' ||
      !(typeof data.default_branch === 'string' || data.default_branch === null)) {
      throw new GitHubError('network', 'GitHub 返回的仓库信息不完整。');
    }
    return { id: data.id, owner: data.owner.login, name: data.name, defaultBranch: data.default_branch };
  }

  async listBranches(repo: Repository, signal?: AbortSignal): Promise<string[]> {
    const basePath = `${repoPath(repo)}/branches`;
    let next: URL | null = new URL(`${basePath}?per_page=100`, API_ORIGIN);
    const branches: string[] = [];
    const visited = new Set<string>();
    while (next) {
      if (next.origin !== API_ORIGIN || next.pathname !== basePath || visited.has(next.toString())) {
        throw new GitHubError('network', 'GitHub 返回了无效的分支分页地址。');
      }
      visited.add(next.toString());
      const { value, response } = await this.#json(next, signal);
      if (!Array.isArray(value) || value.some((item) => typeof item?.name !== 'string')) {
        throw new GitHubError('network', 'GitHub 返回的分支列表无效。');
      }
      branches.push(...value.map((item: { name: string }) => item.name));
      const links = response.headers.get('link') ?? '';
      const link = [...links.matchAll(/<([^>]+)>([^,]*)/g)].find((match) => /rel\s*=\s*"next"/i.test(match[2]));
      try { next = link ? new URL(link[1]) : null; }
      catch { throw new GitHubError('network', 'GitHub 返回了无效的分支分页地址。'); }
    }
    return branches;
  }

  async resolveRef(repo: Repository, branch: string, signal?: AbortSignal): Promise<BranchRef | null> {
    try {
      const { value } = await this.#json(new URL(`${repoPath(repo)}/commits/${encodeURIComponent(branch)}`, API_ORIGIN), signal);
      const data = value as { sha?: unknown };
      if (typeof data?.sha !== 'string' || !data.sha) throw new GitHubError('network', 'GitHub 返回的版本信息无效。');
      return { name: branch, commitSha: data.sha };
    } catch (error) {
      if (error instanceof GitHubError && error.kind === 'empty-repository') return null;
      throw error;
    }
  }

  async listDirectory(repo: Repository, path: string, commitSha: string, signal?: AbortSignal): Promise<GitHubEntry[]> {
    const url = new URL(`${repoPath(repo)}/contents${encodePath(path)}`, API_ORIGIN);
    url.searchParams.set('ref', commitSha);
    const { value } = await this.#json(url, signal);
    if (!Array.isArray(value) || value.some((entry) => typeof entry?.path !== 'string' || typeof entry.sha !== 'string' ||
      typeof entry.size !== 'number' || !['file', 'dir', 'symlink', 'submodule'].includes(entry.type))) {
      throw new GitHubError('network', 'GitHub 返回的目录信息无效。');
    }
    return value.map(({ path: entryPath, type, sha, size }: GitHubEntry) => ({ path: entryPath, type, sha, size }));
  }

  async readFile(repo: Repository, path: string, commitSha: string, signal?: AbortSignal): Promise<DocumentFile> {
    const url = new URL(`${repoPath(repo)}/contents${encodePath(path)}`, API_ORIGIN);
    url.searchParams.set('ref', commitSha);
    const { value } = await this.#json(url, signal);
    const data = value as { type?: unknown; path?: unknown; sha?: unknown; size?: unknown; encoding?: unknown; content?: unknown };
    if (data?.type !== 'file' || typeof data.path !== 'string' || typeof data.sha !== 'string' || typeof data.size !== 'number' ||
      data.encoding !== 'base64' || typeof data.content !== 'string') {
      throw new GitHubError('network', 'GitHub 返回的文件内容无效。');
    }
    try {
      const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, '')), (character) => character.charCodeAt(0));
      return { path: data.path, blobSha: data.sha, size: data.size, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    } catch { throw new GitHubError('network', '文件不是有效的 UTF-8 文档。'); }
  }
}
