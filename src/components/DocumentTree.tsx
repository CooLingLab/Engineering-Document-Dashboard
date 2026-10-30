import { useEffect, useMemo, useState } from 'react';
import type { DocumentFile } from '../domain/project';
import { ancestorFolders, type DocumentStageLinks, type FolderTreeItem } from '../documents/tree';

type Props = {
  root: string;
  tree: FolderTreeItem;
  documents: DocumentFile[];
  links: DocumentStageLinks;
  selectedStageId: string | null;
  selectedPath: string | null;
  onSelectDocument: (path: string) => void;
};

export function DocumentTree({ root, tree, documents, links, selectedStageId, selectedPath, onSelectDocument }: Props) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const activePaths = useMemo(() => new Set(selectedStageId ? links.byStage.get(selectedStageId) ?? [] : []),
    [links, selectedStageId]);

  // Selecting a stage or a file reveals its actual location in the directory hierarchy.
  useEffect(() => {
    const paths = selectedPath ? [selectedPath, ...activePaths] : [...activePaths];
    const ancestors = paths.flatMap((path) => ancestorFolders(root, path));
    if (ancestors.length) setExpanded((current) => new Set([...current, ...ancestors]));
  }, [root, selectedPath, activePaths]);

  function toggleFolder(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderFile(file: { name: string; path: string }) {
    const stages = links.byPath.get(file.path) ?? [];
    const active = activePaths.has(file.path);
    const chosen = selectedPath === file.path;
    const ambiguous = links.ambiguousPaths.has(file.path);
    return <li key={file.path} role="treeitem" aria-selected={chosen}>
      <button type="button" className={`tree-file${active ? ' is-stage-linked' : ''}${chosen ? ' is-selected' : ''}`}
        title={file.path} aria-label={`查看文档：${file.path}`}
        onClick={() => onSelectDocument(file.path)}>
        <span aria-hidden="true">📄</span>
        <span className="tree-filename">{file.name}</span>
        {active ? <span className="tree-file-tag">当前阶段</span>
          : ambiguous && stages.length === 0 ? <span className="tree-file-hint">待确认</span>
          : stages.length === 0 ? <span className="tree-file-hint">未关联</span>
          : stages.length > 1 ? <span className="tree-file-hint">{stages.length} 阶段</span> : null}
      </button>
    </li>;
  }

  function renderFolder(folder: FolderTreeItem): React.ReactNode {
    const open = expanded.has(folder.path);
    return <li key={folder.path} role="treeitem" aria-expanded={open}>
      <button type="button" className="tree-folder" aria-label={`${open ? '收起' : '展开'}文件夹：${folder.path}`}
        onClick={() => toggleFolder(folder.path)}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span aria-hidden="true">{open ? '📂' : '📁'}</span>
        <span className="tree-filename">{folder.name}/</span>
      </button>
      {open && <ul role="group" className="tree-children">
        {folder.folders.map(renderFolder)}
        {folder.files.map(renderFile)}
      </ul>}
    </li>;
  }

  const found = documents.filter((document) => document.path.startsWith(`${root}/`));
  const linkedCount = found.filter((document) => (links.byPath.get(document.path)?.length ?? 0) > 0).length;
  const results = query.trim()
    ? found.filter((document) => document.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
      .sort((a, b) => a.path.localeCompare(b.path))
    : null;

  return <section className="document-tree-panel" aria-label="文件目录">
    <div className="document-tree-heading"><div><strong>文件目录</strong><p>{found.length} 份 Markdown · 已关联 {linkedCount} 份</p></div><span aria-hidden="true">📁</span></div>
    <label className="tree-search-label">查找文档
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        aria-label="搜索 Markdown 文档" placeholder="按文件名或路径搜索" />
    </label>
    <div className="tree-root"><span aria-hidden="true">📂</span><span title={root}>{root}/</span></div>
    {!found.length ? <p className="tree-empty">文档目录中尚未扫描到 Markdown 文件。</p>
      : results ? <ul role="tree" aria-label="文档搜索结果" className="tree-list tree-search-results">
          {results.map((document) => renderFile({
            path: document.path,
            name: document.path.slice(root.length + 1),
          }))}
          {!results.length && <li className="tree-empty">没有找到匹配的文档。</li>}
        </ul>
      : <ul role="tree" aria-label="项目文档树" className="tree-list">
          {tree.folders.map(renderFolder)}
          {tree.files.map(renderFile)}
        </ul>}
    {found.some((document) => !links.byPath.has(document.path)) &&
      <p className="tree-legend">未关联文件同样显示在原始目录中，可在阶段详情中建立关联。</p>}
  </section>;
}
