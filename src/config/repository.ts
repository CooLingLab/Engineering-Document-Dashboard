import type { ProjectConfig, Repository } from '../domain/project';
import { parseProjectConfig } from '../domain/schema';
import type { MemoryCredentials } from '../github/credentials';

export type ConfigRepository = { repository: Repository; branch: string | null };
export type LoadedConfiguration = { config: ProjectConfig | null; fileSha: string | null; unsupportedVersion: number | null };
export type SaveResult = { kind: 'saved'; fileSha: string } | { kind: 'conflict' } | { kind: 'uncertain' };

const limit = 2 * 1024 * 1024;
function encode(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > limit) throw new Error('配置超过 2 MiB，无法保存。');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(encoded: string, size: unknown) {
  if (typeof size !== 'number' || size < 0 || size > limit || encoded.length > limit * 2) throw new Error('配置文件超过大小限制或格式无效。');
  try {
    const compact = encoded.replace(/\s/g, '');
    if (compact.length > Math.ceil(limit / 3) * 4) throw new Error();
    const bytes = Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
    if (bytes.length !== size) throw new Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { throw new Error('配置文件不是有效的 UTF-8 内容。'); }
}

export class ConfigRepositoryGateway {
  readonly source: ConfigRepository;
  #fetcher: typeof fetch;
  #credentials: MemoryCredentials;
  #queue: Promise<unknown> = Promise.resolve();
  constructor(source: ConfigRepository, options: { fetcher: typeof fetch; credentials: MemoryCredentials }) {
    this.source = structuredClone(source);
    this.#fetcher = options.fetcher;
    this.#credentials = options.credentials;
  }
  #path() {
    const repo = this.source.repository;
    return `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  }
  #checkTarget(id: number) {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('目标项目 ID 无效。');
    if (id === this.source.repository.id) throw new Error('配置必须保存在独立仓库，不能写入目标项目。');
  }
  async #request(url: string, init: RequestInit = {}) {
    const token = this.#credentials.get('config');
    if (!token) throw new Error('请提供配置仓库的读写令牌。');
    const parsed = new URL(url);
    if (parsed.origin !== 'https://api.github.com' || parsed.username || parsed.password) throw new Error('配置仓库地址无效。');
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('Authorization', `Bearer ${token}`);
    try { return await this.#fetcher.call(globalThis, url, { ...init, headers, redirect: 'error' }); }
    catch { throw new Error('无法连接 GitHub；请检查网络或浏览器连接权限。'); }
  }
  async inspect(signal?: AbortSignal): Promise<{ isPrivate: boolean; defaultBranch: string | null }> {
    const response = await this.#request(this.#path(), { method: 'GET', signal });
    if (!response.ok) throw new Error(response.status === 401 ? '配置仓库令牌无效或已过期。' : '配置仓库不存在或当前令牌无法访问。');
    const value: unknown = await response.json();
    const data = value as { id?: unknown; private?: unknown; default_branch?: unknown };
    if (data?.id !== this.source.repository.id || typeof data.private !== 'boolean' ||
      !(typeof data.default_branch === 'string' || data.default_branch === null)) throw new Error('配置仓库身份或信息无效。');
    return { isPrivate: data.private, defaultBranch: data.default_branch };
  }
  async #read(id: number, signal?: AbortSignal): Promise<{ text: string; sha: string } | null> {
    const url = new URL(`${this.#path()}/contents/projects/${id}.json`);
    if (this.source.branch) url.searchParams.set('ref', this.source.branch);
    const response = await this.#request(url.toString(), { method: 'GET', signal });
    if (response.status === 409) { this.source.branch = null; return null; }
    if (response.status === 404) {
      const root = new URL(`${this.#path()}/contents`);
      if (this.source.branch) root.searchParams.set('ref', this.source.branch);
      const checked = await this.#request(root.toString(), { method: 'GET', signal });
      if (checked.status === 409) { this.source.branch = null; return null; }
      if (checked.status === 404) {
        const commits = await this.#request(`${this.#path()}/commits?per_page=1`, { method: 'GET', signal });
        if (commits.status === 409) { this.source.branch = null; return null; }
      }
      if (!checked.ok || !Array.isArray(await checked.json())) throw new Error('无法确认配置仓库或分支可读，请检查权限和分支。');
      return null;
    }
    if (!response.ok) throw new Error('无法读取配置文件，请检查令牌和仓库权限。');
    const value: unknown = await response.json();
    const file = value as { type?: unknown; sha?: unknown; encoding?: unknown; content?: unknown; size?: unknown };
    if (file?.type !== 'file' || typeof file.sha !== 'string' || !file.sha) throw new Error('配置文件格式无效。');
    if (file.encoding === 'none') {
      if (!/^[0-9a-f]{40}$/i.test(file.sha) || typeof file.size !== 'number' || file.size > limit || file.size < 0) throw new Error('配置文件格式无效或超过大小限制。');
      const blobResponse = await this.#request(`${this.#path()}/git/blobs/${file.sha}`, { method: 'GET', signal });
      if (!blobResponse.ok) throw new Error('无法读取配置文件内容。');
      const blob = await blobResponse.json() as { sha?: unknown; size?: unknown; encoding?: unknown; content?: unknown };
      if (blob.sha !== file.sha || blob.size !== file.size || blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new Error('配置文件内容不一致。');
      return { text: decode(blob.content, blob.size), sha: file.sha };
    }
    if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('配置文件格式无效。');
    return { text: decode(file.content, file.size), sha: file.sha };
  }
  async loadConfiguration(targetRepositoryId: number, signal?: AbortSignal): Promise<LoadedConfiguration> {
    this.#checkTarget(targetRepositoryId);
    await this.inspect(signal);
    const file = await this.#read(targetRepositoryId, signal);
    if (!file) return { config: null, fileSha: null, unsupportedVersion: null };
    let data: unknown;
    try { data = JSON.parse(file.text); } catch { throw new Error('配置文件不是有效的 JSON。'); }
    const parsed = parseProjectConfig(data);
    if (parsed.kind === 'unsupported-version') return { config: null, fileSha: file.sha, unsupportedVersion: parsed.version };
    if (parsed.config.repository.id !== targetRepositoryId) throw new Error('配置文件与当前项目不匹配。');
    return { config: parsed.config, fileSha: file.sha, unsupportedVersion: null };
  }
  saveConfiguration(config: ProjectConfig, expectedSha: string | null, signal?: AbortSignal): Promise<SaveResult> {
    const task = this.#queue.then(() => this.#save(config, expectedSha, signal));
    this.#queue = task.catch(() => undefined);
    return task;
  }
  async #save(config: ProjectConfig, expectedSha: string | null, signal?: AbortSignal): Promise<SaveResult> {
    this.#checkTarget(config.repository.id);
    const parsed = parseProjectConfig(config);
    if (parsed.kind !== 'supported') throw new Error('无法保存不支持的配置版本。');
    const text = JSON.stringify(parsed.config, null, 2) + '\n';
    const content = encode(text);
    const metadata = await this.inspect(signal);
    const body = { message: 'chore: 更新开发路线配置', content,
      ...(expectedSha ? { sha: expectedSha } : {}), ...(this.source.branch ? { branch: this.source.branch } : {}) };
    const reconcile = async (): Promise<SaveResult> => {
      if (signal?.aborted) return { kind: 'uncertain' };
      try {
        const remote = await this.#read(config.repository.id);
        if (remote?.text === text) {
          this.source.branch ??= metadata.defaultBranch;
          return { kind: 'saved', fileSha: remote.sha };
        }
      } catch { /* 结果未知时保留草稿，绝不重复写入。 */ }
      return { kind: 'uncertain' };
    };
    let response: Response;
    try {
      response = await this.#request(`${this.#path()}/contents/projects/${config.repository.id}.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
      });
    } catch { return reconcile(); }
    if (response.status === 409 || response.status === 422) return { kind: 'conflict' };
    if (response.status >= 500) return reconcile();
    if (!response.ok) throw new Error('保存失败，请检查配置仓库令牌和权限。');
    let value: unknown;
    try { value = await response.json(); } catch { return { kind: 'uncertain' }; }
    const sha = (value as { content?: { sha?: unknown } })?.content?.sha;
    if (typeof sha !== 'string' || !sha) return { kind: 'uncertain' };
    this.source.branch ??= metadata.defaultBranch;
    return { kind: 'saved', fileSha: sha };
  }
}
