import type { DocumentFile, DocumentSnapshot, ReadIssue, Repository } from '../domain/project';
import { GitHubError, type GitHubReader } from '../github/client';

const MAX_FILE_BYTES = 200 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_DIRECTORY_ENTRIES = 1000;

export function normalizeDocumentRoot(root: string): string {
  const value = root.trim().replace(/\/+$/, '');
  if (!value || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) {
    throw new Error('文档目录必须是仓库内的相对路径。');
  }
  return value;
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
}

export async function loadDocumentSnapshot(reader: GitHubReader, repo: Repository, branch: string, root: string, signal?: AbortSignal): Promise<DocumentSnapshot> {
  const directory = normalizeDocumentRoot(root);
  ensureNotAborted(signal);
  const ref = await reader.resolveRef(repo, branch, signal);
  ensureNotAborted(signal);
  const documents: DocumentFile[] = [];
  const issues: ReadIssue[] = [];
  const snapshot = (): DocumentSnapshot => ({ repository: repo, ref, root: directory, documents, issues, fetchedAt: new Date().toISOString() });
  if (!ref) return snapshot();

  const queue = [directory];
  const visited = new Set<string>();
  let scannedFiles = 0;
  let totalBytes = 0;
  let limitReached = false;
  while (queue.length && !limitReached) {
    ensureNotAborted(signal);
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    let entries;
    try {
      entries = await reader.listDirectory(repo, current, ref.commitSha, signal);
    } catch (error) {
      if (!(error instanceof GitHubError) || error.kind !== 'not-found-or-no-access') throw error;
      const checkedRepo = await reader.getRepository({ owner: repo.owner, name: repo.name }, signal);
      if (checkedRepo.id !== repo.id) throw new GitHubError('not-found-or-no-access', '仓库身份发生变化，请重新连接。');
      const checkedRef = await reader.resolveRef(repo, branch, signal);
      if (!checkedRef) throw new GitHubError('not-found-or-no-access', '当前分支不可读取。');
      issues.push({
        path: current,
        kind: current === directory ? 'missing' : 'incomplete',
        message: current === directory ? '未找到文档目录，可调整目录或稍后补充。' : '子目录无法读取，请缩小范围或重试。',
      });
      continue;
    }
    ensureNotAborted(signal);
    if (entries.length >= MAX_DIRECTORY_ENTRIES) {
      issues.push({ path: current, kind: 'incomplete', message: '目录项目达到 GitHub 返回上限，请选择更小的文档目录。' });
    }
    for (const entry of entries) {
      ensureNotAborted(signal);
      if (!entry.path.startsWith(`${current}/`) || entry.path.slice(current.length + 1).includes('/')) {
        issues.push({ path: current, kind: 'incomplete', message: '目录包含无效路径，部分项目未读取。' });
        continue;
      }
      if (entry.type === 'dir') { queue.push(entry.path); continue; }
      if (entry.type !== 'file' || !entry.path.toLowerCase().endsWith('.md')) continue;
      if (++scannedFiles > MAX_FILES) {
        issues.push({ path: current, kind: 'incomplete', message: '文档超过 200 份，请选择更小的目录。' });
        limitReached = true;
        break;
      }
      if (entry.size > MAX_FILE_BYTES) {
        issues.push({ path: entry.path, kind: 'too-large', message: '文档超过 200 KiB，未读取。' });
        continue;
      }
      if (totalBytes + entry.size > MAX_TOTAL_BYTES) {
        issues.push({ path: current, kind: 'incomplete', message: '文档总大小超过 2 MiB，请选择更小的目录。' });
        limitReached = true;
        break;
      }
      const document = await reader.readFile(repo, entry.path, ref.commitSha, signal);
      ensureNotAborted(signal);
      if (document.path !== entry.path || document.blobSha !== entry.sha || document.size !== entry.size) {
        issues.push({ path: entry.path, kind: 'incomplete', message: '文档信息不一致，请重新读取。' });
        continue;
      }
      totalBytes += document.size;
      documents.push(document);
    }
  }
  return snapshot();
}
