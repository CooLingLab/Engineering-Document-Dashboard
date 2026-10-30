import { describe, expect, it } from 'vitest';
import { buildAnalysisInput } from '../../src/ai/input';
import { validateAnalysis } from '../../src/ai/result';
import { makeConfig, makeSnapshot } from '../fixtures';

const settings = { adapter: 'openai-compatible' as const, endpoint: 'https://example.test/v1/chat/completions', model: 'sample', maxInputChars: 12_000 };
const snapshot = makeSnapshot({ documents: [{ path: 'docs/development/02-requirements.md', blobSha: 'sha1', content: '# 需求\n已经列出范围', size: 20 }] });
const input = buildAnalysisInput(makeConfig(), snapshot, 'requirements', 12_000);
const raw = { nodeId: 'requirements', decision: 'done', summary: '需求已经记录。', evidence: [{ path: input.documents[0].path, startLine: 2, endLine: 2 }], nextAction: null };

describe('analysis evidence', () => {
  it('keeps a valid result with verifiable line references and source identity', () => {
    const record = validateAnalysis(raw, input, settings, new Date('2026-10-30T00:00:00Z'));
    expect(record).toMatchObject({ decision: 'done', branch: 'main', nodeId: 'requirements', model: 'sample', evidence: raw.evidence });
    expect(record.inputs).toEqual([{ path: input.documents[0].path, blobSha: 'sha1' }]);
  });
  it.each([
    { evidence: [{ path: input.documents[0].path, startLine: 3, endLine: 4 }] },
    { evidence: [{ path: 'docs/development/other.md', startLine: 1, endLine: 1 }] },
    { evidence: [] },
  ])('downgrades claims that have no verifiable evidence', ({ evidence }) => {
    const result = validateAnalysis({ ...raw, evidence }, input, settings, new Date());
    expect(result.decision).toBe('insufficient');
    expect(result.evidence).toEqual([]);
    expect(result.nextAction).toBeNull();
  });
  it('rejects a model response naming another stage', () => {
    expect(() => validateAnalysis({ ...raw, nodeId: 'other' }, input, settings, new Date())).toThrow();
  });
  it('does not claim completion when no documents were supplied', () => {
    const empty = buildAnalysisInput(makeConfig(), makeSnapshot(), 'requirements', 12_000);
    expect(validateAnalysis({ ...raw, evidence: [] }, empty, settings, new Date()).decision).toBe('insufficient');
  });
  it('does not treat a heading-only template as proof that a stage is complete', () => {
    const heading = buildAnalysisInput(makeConfig(), makeSnapshot({ documents: [{ path: input.documents[0].path, blobSha: 'empty', content: '# 需求', size: 8 }] }), 'requirements', 12_000);
    const result = validateAnalysis({ ...raw, evidence: [{ path: input.documents[0].path, startLine: 1, endLine: 1 }] }, heading, settings, new Date());
    expect(result.decision).toBe('insufficient');
  });
  it('does not store a long verbatim passage repeated by the model', () => {
    const passage = '这是一段来自私人项目文档的较长原文内容，包含产品目标和设计细节，应该通过引用查看而不是复制到配置仓库。';
    const source = buildAnalysisInput(makeConfig(), makeSnapshot({ documents: [{ path: input.documents[0].path, blobSha: 'blob', content: `# 需求\n${passage}`, size: 200 }] }), 'requirements', 12_000);
    const record = validateAnalysis({ ...raw, summary: passage, nextAction: passage }, source, settings, new Date());
    expect(record.summary).not.toContain(passage);
    expect(record.nextAction).toBeNull();
    expect(record.evidence).toHaveLength(1);
  });
  it('also removes long copied passages disguised with whitespace', () => {
    const passage = '这是一段来自私人项目文档的较长原文内容，包含产品目标和设计细节，应该通过引用查看而不是复制到配置仓库。';
    const source = buildAnalysisInput(makeConfig(), makeSnapshot({ documents: [{ path: input.documents[0].path, blobSha: 'blob', content: `# 需求\n${passage}`, size: 200 }] }), 'requirements', 12_000);
    const disguised = passage.match(/.{1,20}/gu)!.join(' \n');
    const record = validateAnalysis({ ...raw, summary: disguised }, source, settings, new Date());
    expect(record.summary).not.toBe(disguised);
  });
});
