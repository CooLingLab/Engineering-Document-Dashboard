import type { DocumentFile, DocumentSnapshot, ProjectConfig } from '../domain/project';

export type DocumentMatch = { documentId: string; nodeId: string; kind: 'found' | 'missing' | 'unavailable' | 'ambiguous'; paths: string[]; contentCheck: 'empty' | 'heading-only' | 'not-checked' };
export type DocumentIndex = { matches: DocumentMatch[]; others: DocumentFile[] };

function checkContent(document: DocumentFile): DocumentMatch['contentCheck'] {
  const lines = document.content.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return 'empty';
  return lines.every((line) => /^#{1,6}\s+\S/.test(line)) ? 'heading-only' : 'not-checked';
}

export function indexDocuments(config: ProjectConfig, snapshot: DocumentSnapshot): DocumentIndex {
  const root = snapshot.root.replace(/\/+$/, '');
  const documents = snapshot.documents.filter((document) => document.path.startsWith(`${root}/`));
  const used = new Set<string>();
  const matches: DocumentMatch[] = config.documentRules.expected.map((expected) => {
    const boundPath = Object.hasOwn(config.documentRules.bindings, expected.id)
      ? config.documentRules.bindings[expected.id] : undefined;
    const validName = expected.fileName && !expected.fileName.startsWith('/') &&
      !expected.fileName.split('/').some((part) => !part || part === '.' || part === '..' || /[\\\0]/.test(part));
    const candidates = boundPath
      ? documents.filter((document) => document.path === boundPath)
      : validName
        ? documents.filter((document) => expected.fileName.includes('/')
          ? document.path === `${root}/${expected.fileName}`
          : document.path.split('/').at(-1) === expected.fileName)
        : [];
    const unavailable = Boolean(boundPath) || !validName || snapshot.issues.some((issue) =>
      issue.kind === 'incomplete' || (issue.kind === 'too-large' &&
        (issue.path === boundPath || issue.path.split('/').at(-1) === expected.fileName)));
    let kind: DocumentMatch['kind'];
    if (candidates.length === 1) kind = 'found';
    else if (candidates.length > 1) kind = 'ambiguous';
    else kind = unavailable ? 'unavailable' : 'missing';
    if (kind === 'found') used.add(candidates[0].path);
    return {
      documentId: expected.id, nodeId: expected.nodeId, kind,
      paths: candidates.length ? candidates.map((candidate) => candidate.path).sort() : boundPath ? [boundPath] : [],
      contentCheck: kind === 'found' ? checkContent(candidates[0]) : 'not-checked',
    };
  });
  return { matches, others: documents.filter((document) => !used.has(document.path)) };
}
