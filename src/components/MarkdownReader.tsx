import type { DocumentSnapshot } from '../domain/project';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function githubFileUrl(snapshot: DocumentSnapshot, documentPath: string, href = ''): string | undefined {
  if (!snapshot.ref) return undefined;
  try {
    if (/^https?:\/\//i.test(href)) return new URL(href).toString();
    if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return undefined;
    const localBase = `https://repository.invalid/${documentPath.split('/').map(encodeURIComponent).join('/')}`;
    const target = new URL(href || documentPath.split('/').at(-1)!, localBase);
    if (target.origin !== 'https://repository.invalid') return undefined;
    const { owner, name } = snapshot.repository;
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${encodeURIComponent(snapshot.ref.name)}${target.pathname}${target.search}${target.hash}`;
  } catch { return undefined; }
}

export function MarkdownReader({ content, documentPath, snapshot }: { content: string; documentPath: string; snapshot: DocumentSnapshot }) {
  const original = githubFileUrl(snapshot, documentPath);
  return (
    <div className="markdown-content">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
        a: ({ href, children }) => {
          const safeHref = href ? githubFileUrl(snapshot, documentPath, href) : undefined;
          return safeHref ? <a href={safeHref} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}</span>;
        },
        img: ({ alt }) => <span className="image-placeholder">图片：{alt || '未命名'} {original && <a href={original} target="_blank" rel="noreferrer noopener">在 GitHub 查看</a>}</span>,
        input: ({ type, checked }) => type === 'checkbox' ? <input type="checkbox" checked={checked} disabled readOnly /> : null,
      }}>{content}</Markdown>
    </div>
  );
}
