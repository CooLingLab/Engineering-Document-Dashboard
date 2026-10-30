import { describe, expect, it } from 'vitest';
import { analysisInputKey, deriveNodeView, setDocumentChoice, setManualStatus } from '../../src/workflow/status';
import { makeAnalysis, makeConfig, makeSnapshot } from '../fixtures';
import { parseProjectConfig } from '../../src/domain/schema';

describe('stage status', () => {
  it('keeps a manual status ahead of a fresh AI suggestion', () => {
    const snapshot = makeSnapshot();
    const config = setManualStatus(makeConfig(), 'main', 'requirements', 'done');
    config.branches.main.analyses.requirements = makeAnalysis({ inputFingerprint: analysisInputKey(config, snapshot, 'requirements') });
    expect(deriveNodeView(config, snapshot, 'requirements', true)).toMatchObject({ status: 'done', source: 'manual', analysis: 'fresh' });
    const cleared = setManualStatus(config, 'main', 'requirements', null);
    expect(deriveNodeView(cleared, snapshot, 'requirements', true)).toMatchObject({ status: 'in-progress', source: 'ai' });
  });

  it('keeps branches separate, including a branch named __proto__', () => {
    const config = setManualStatus(makeConfig(), '__proto__', 'requirements', 'done');
    const changed = setDocumentChoice(config, 'main', 'requirements-doc', 'later');
    expect(Object.hasOwn(changed.branches, '__proto__')).toBe(true);
    expect(changed.branches['__proto__'].manualStatuses.requirements).toBe('done');
    expect(changed.branches.main.manualStatuses).toEqual({});
    expect(changed.branches.main.documentChoices['requirements-doc']).toBe('later');
    const parsed = parseProjectConfig(JSON.parse(JSON.stringify(changed)));
    expect(parsed.kind).toBe('supported');
    if (parsed.kind !== 'supported') throw new Error('配置版本不受支持');
    expect(Object.hasOwn(parsed.config.branches, '__proto__')).toBe(true);
    expect(parsed.config.branches['__proto__'].manualStatuses.requirements).toBe('done');
  });

  it('marks old AI evidence stale without clearing a manual status', () => {
    const snapshot = makeSnapshot({ documents: [{ path: 'docs/development/02-requirements.md', blobSha: 'old', content: '正文', size: 6 }] });
    const config = setManualStatus(makeConfig(), 'main', 'requirements', 'done');
    config.branches.main.analyses.requirements = makeAnalysis({ inputFingerprint: analysisInputKey(config, snapshot, 'requirements') });
    const changed = makeSnapshot({ documents: [{ ...snapshot.documents[0], blobSha: 'new' }] });
    expect(deriveNodeView(config, changed, 'requirements', true)).toMatchObject({ status: 'done', source: 'manual', analysis: 'stale' });
    expect(deriveNodeView(makeConfig(), changed, 'requirements', false)).toMatchObject({ status: 'unknown', source: 'none', analysis: 'disabled' });
  });

  it('does not stale analysis for unrelated commit or canvas-position changes', () => {
    const config = makeConfig();
    const snapshot = makeSnapshot();
    const before = analysisInputKey(config, snapshot, 'requirements');
    config.graph.nodes[0].position = { x: 900, y: 42 };
    const after = analysisInputKey(config, { ...snapshot, ref: { name: 'main', commitSha: 'new-code-only' } }, 'requirements');
    expect(after).toBe(before);
  });
});
