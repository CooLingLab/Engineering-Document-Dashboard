import type { DocumentFile, WorkflowGraph } from '../domain/project';
import type { DocumentIndex } from './match';

export type FileTreeItem = { name: string; path: string };
export type FolderTreeItem = {
  name: string;
  path: string;
  folders: FolderTreeItem[];
  files: FileTreeItem[];
};

/** Build a true folder hierarchy from the paths already fetched by the read-only GitHub scanner. */
export function buildDocumentTree(root: string, documents: readonly Pick<DocumentFile, 'path'>[]): FolderTreeItem {
  const normalizedRoot = root.replace(/\/+$/, '');
  const folder: FolderTreeItem = {
    name: normalizedRoot.split('/').at(-1) ?? normalizedRoot,
    path: normalizedRoot,
    folders: [],
    files: [],
  };
  const directories = new Map<string, FolderTreeItem>([[normalizedRoot, folder]]);
  const knownFiles = new Set<string>();

  for (const document of documents) {
    if (!document.path.startsWith(`${normalizedRoot}/`) || knownFiles.has(document.path)) continue;
    const relative = document.path.slice(normalizedRoot.length + 1).split('/');
    if (relative.some((part) => !part || part === '.' || part === '..')) continue;
    knownFiles.add(document.path);
    let parent = folder;
    for (const part of relative.slice(0, -1)) {
      const path = `${parent.path}/${part}`;
      let next = directories.get(path);
      if (!next) {
        next = { name: part, path, folders: [], files: [] };
        parent.folders.push(next);
        directories.set(path, next);
      }
      parent = next;
    }
    parent.files.push({ name: relative.at(-1)!, path: document.path });
  }

  const compare = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  function sort(node: FolderTreeItem) {
    node.folders.sort(compare);
    node.files.sort(compare);
    for (const child of node.folders) sort(child);
  }
  sort(folder);
  return folder;
}

export type DocumentStageLinks = {
  byPath: Map<string, string[]>;
  byStage: Map<string, string[]>;
  ambiguousPaths: Set<string>;
};

/**
 * Only unambiguous "found" matches are definitive links. An ambiguous file
 * candidate should not silently acquire a stage association.
 */
export function buildDocumentStageLinks(index: DocumentIndex, graph: WorkflowGraph): DocumentStageLinks {
  const validStages = new Set(graph.nodes.map((node) => node.id));
  const byPathSets = new Map<string, Set<string>>();
  const byStageSets = new Map<string, Set<string>>();
  const ambiguousPaths = new Set<string>();

  for (const match of index.matches) {
    if (!validStages.has(match.nodeId)) continue;
    if (match.kind === 'ambiguous') {
      for (const path of match.paths) ambiguousPaths.add(path);
      continue;
    }
    if (match.kind !== 'found') continue;
    for (const path of match.paths) {
      if (!byPathSets.has(path)) byPathSets.set(path, new Set());
      if (!byStageSets.has(match.nodeId)) byStageSets.set(match.nodeId, new Set());
      byPathSets.get(path)!.add(match.nodeId);
      byStageSets.get(match.nodeId)!.add(path);
    }
  }

  const stageOrder = new Map(graph.nodes.map((node) => [node.id, node.order]));
  return {
    byPath: new Map([...byPathSets].map(([path, stages]) =>
      [path, [...stages].sort((a, b) => (stageOrder.get(a) ?? 0) - (stageOrder.get(b) ?? 0))])),
    byStage: new Map([...byStageSets].map(([stage, paths]) =>
      [stage, [...paths].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))])),
    ambiguousPaths,
  };
}

/** Return parent folders of a file, excluding the read-only scan root. */
export function ancestorFolders(root: string, filePath: string): string[] {
  if (!filePath.startsWith(`${root}/`)) return [];
  const parts = filePath.slice(root.length + 1).split('/');
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    result.push(`${root}/${parts.slice(0, i).join('/')}`);
  }
  return result;
}
