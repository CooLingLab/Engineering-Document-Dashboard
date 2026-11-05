import { describe, expect, it } from 'vitest';
import { ancestorFolders, buildDocumentStageLinks, buildDocumentTree } from '../../src/documents/tree';
import { devflowTemplate } from '../../src/templates/catalog';
import type { DocumentIndex } from '../../src/documents/match';

describe('GitHub Markdown folder tree', () => {
  it('preserves nested physical paths, sorts directories, and excludes other roots', () => {
    const root = 'docs/development';
    const tree = buildDocumentTree(root, [
      { path: 'docs/development/planning/b/10-last.md' },
      { path: 'docs/development/planning/b/02-first.md' },
      { path: 'docs/development/planning/a/01-first.md' },
      { path: 'docs/development/00-overview.md' },
      { path: 'docs/other/secret.md' },
    ]);
    expect(tree.path).toBe(root);
    expect(tree.files.map((file) => file.name)).toEqual(['00-overview.md']);
    expect(tree.folders.map((node) => node.path)).toEqual(['docs/development/planning']);
    const planning = tree.folders[0];
    expect(planning.folders.map((node) => node.name)).toEqual(['a', 'b']);
    expect(planning.folders[1].files.map((file) => file.name)).toEqual(['02-first.md', '10-last.md']);
    expect(ancestorFolders(root, 'docs/development/planning/b/02-first.md'))
      .toEqual(['docs/development/planning', 'docs/development/planning/b']);
    expect(ancestorFolders(root, 'docs/other/secret.md')).toEqual([]);
  });

  it('maps files back to multiple confirmed stages without inventing ambiguous associations', () => {
    const path = 'docs/development/planning/shared.md';
    const index: DocumentIndex = {
      matches: [
        { documentId: 'a', nodeId: 'domain', kind: 'found', paths: [path], contentCheck: 'not-checked' },
        { documentId: 'b', nodeId: 'spec', kind: 'found', paths: [path], contentCheck: 'not-checked' },
        { documentId: 'c', nodeId: 'idea', kind: 'ambiguous', paths: [path, 'docs/development/other.md'], contentCheck: 'not-checked' },
        { documentId: 'd', nodeId: 'invalid', kind: 'found', paths: ['docs/development/ignore.md'], contentCheck: 'not-checked' },
      ],
      others: [],
    };
    const links = buildDocumentStageLinks(index, devflowTemplate.graph);
    expect(links.byPath.get(path)).toEqual(['domain', 'spec']);
    expect(links.byStage.get('spec')).toEqual([path]);
    expect(links.byStage.has('idea')).toBe(false);
    expect(links.ambiguousPaths.has('docs/development/other.md')).toBe(true);
    expect(links.byPath.has('docs/development/other.md')).toBe(false);
    expect(links.byPath.has('docs/development/ignore.md')).toBe(false);
  });
});
