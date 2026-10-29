import { describe, expect, it } from 'vitest';
import { indexDocuments } from '../../src/documents/match';
import { getBranchState } from '../../src/domain/project';
import { makeConfig, makeSnapshot } from '../fixtures';

const doc = (path: string, content: string) => ({ path, blobSha: `sha-${path}`, size: content.length, content });

describe('matching development documents', () => {
  it('recognizes an empty template without assuming the stage is complete', () => {
    const config = makeConfig();
    const snapshot = makeSnapshot({ documents: [doc('docs/development/02-requirements.md', '# 需求')] });
    expect(indexDocuments(config, snapshot).matches[0]).toMatchObject({ kind: 'found', contentCheck: 'heading-only' });
    expect(getBranchState(config, 'main').manualStatuses).toEqual({});
  });

  it('lets the user override a standard filename and leaves other documents visible', () => {
    const config = makeConfig();
    config.documentRules.bindings['requirements-doc'] = 'docs/development/用户需求.md';
    const snapshot = makeSnapshot({ documents: [
      doc('docs/development/02-requirements.md', '# 旧需求\n正文'),
      doc('docs/development/用户需求.md', '# 当前需求\n正文'),
      doc('README.md', '# 项目根目录'),
    ] });
    const index = indexDocuments(config, snapshot);
    expect(index.matches[0]).toMatchObject({ kind: 'found', paths: ['docs/development/用户需求.md'] });
    expect(index.others.map((item) => item.path)).toEqual(['docs/development/02-requirements.md']);
  });

  it('offers ambiguous candidates rather than picking one by accident', () => {
    const config = makeConfig();
    const snapshot = makeSnapshot({ documents: [
      doc('docs/development/a/02-requirements.md', '# A'),
      doc('docs/development/b/02-requirements.md', '# B'),
    ] });
    expect(indexDocuments(config, snapshot).matches[0]).toMatchObject({
      kind: 'ambiguous', paths: ['docs/development/a/02-requirements.md', 'docs/development/b/02-requirements.md'],
    });
  });

  it('retains an unavailable manual association when the file moved or was deleted', () => {
    const config = makeConfig();
    config.documentRules.bindings['requirements-doc'] = 'docs/development/old.md';
    const index = indexDocuments(config, makeSnapshot({ documents: [doc('docs/development/02-requirements.md', '# 可用')] }));
    expect(index.matches[0]).toMatchObject({ kind: 'unavailable', paths: ['docs/development/old.md'] });
    expect(config.documentRules.bindings['requirements-doc']).toBe('docs/development/old.md');
  });

  it('does not claim files are missing after an incomplete scan', () => {
    const index = indexDocuments(makeConfig(), makeSnapshot({
      issues: [{ path: 'docs/development', kind: 'incomplete', message: '目录未完全读取' }],
    }));
    expect(index.matches[0].kind).toBe('unavailable');
  });

  it('treats an oversized matching document as unavailable, not missing', () => {
    const index = indexDocuments(makeConfig(), makeSnapshot({
      issues: [{ path: 'docs/development/02-requirements.md', kind: 'too-large', message: '文件过大' }],
    }));
    expect(index.matches[0].kind).toBe('unavailable');
  });
});
