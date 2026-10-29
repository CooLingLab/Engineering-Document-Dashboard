export type RepositoryInput = { owner: string; name: string };

export function parseRepositoryInput(input: string): RepositoryInput {
  const value = input.trim();
  let path = value;
  if (value.includes('://')) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('请输入有效的 GitHub 仓库地址。'); }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) {
      throw new Error('请输入不含凭据的 GitHub HTTPS 仓库地址。');
    }
    path = url.pathname.replace(/^\/+|\/+$/g, '');
  }
  const parts = path.split('/');
  if (parts.length !== 2) throw new Error('请输入仓库根地址或 owner/repository。');
  const [owner, rawName] = parts;
  const name = rawName.replace(/\.git$/, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(owner) || !/^[a-z\d_.-]+$/i.test(name) || name === '.' || name === '..') {
    throw new Error('仓库名称格式无效。');
  }
  return { owner, name };
}
