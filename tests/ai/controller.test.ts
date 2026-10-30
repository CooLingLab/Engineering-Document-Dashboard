import { describe, expect, it, vi } from 'vitest';
import { AnalysisController } from '../../src/ai/controller';
import { deriveNodeView, setManualStatus } from '../../src/workflow/status';
import { makeConfig, makeSnapshot } from '../fixtures';
import { createProject } from '../../src/domain/project';
import { templates } from '../../src/templates/catalog';

const settings = { adapter: 'openai-compatible' as const, endpoint: 'https://model.example/api', model: 'sample', maxInputChars: 12_000 };
function documentSnapshot() {
  return makeSnapshot({ documents: [{ path: 'docs/development/02-requirements.md', blobSha: 'blob-1', content: '# 需求\n用户可以登录', size: 20 }] });
}

describe('analysis controller', () => {
  it('does not call a model until a prepared scope is explicitly run', async () => {
    const session = { config: makeConfig(), snapshot: documentSnapshot() };
    const analyze = vi.fn(async () => ({ nodeId: 'requirements', decision: 'done', summary: '需求已记录', evidence: [{ path: 'docs/development/02-requirements.md', startLine: 2, endLine: 2 }], nextAction: null }));
    const commit = vi.fn();
    const controller = new AnalysisController({ getSession: () => session, adapterFor: () => ({ analyze }), getModelKey: () => undefined, commit });
    const preview = controller.prepare(['requirements'], settings);
    expect(analyze).not.toHaveBeenCalled();
    expect(preview.inputs[0].documents[0].path).toBe('docs/development/02-requirements.md');
    await controller.run(preview);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('commits delayed results to their original branch without changing a newer manual status', async () => {
    let session = { config: makeConfig(), snapshot: documentSnapshot() };
    let release!: (value: unknown) => void;
    const analyze = vi.fn(() => new Promise<unknown>((resolve) => { release = resolve; }));
    const commit = vi.fn((_id, record) => {
      const next = structuredClone(session.config);
      const branch = record.branch;
      next.branches[branch] = next.branches[branch] ?? { manualStatuses: {}, documentChoices: {}, analyses: {} };
      next.branches[branch].analyses[record.nodeId] = record;
      session = { ...session, config: next };
    });
    const controller = new AnalysisController({ getSession: () => session, adapterFor: () => ({ analyze }), getModelKey: () => undefined, commit });
    const preview = controller.prepare(['requirements'], settings);
    const pending = controller.run(preview);
    session = { config: setManualStatus(session.config, 'main', 'requirements', 'done'), snapshot: documentSnapshot() };
    session = { ...session, snapshot: makeSnapshot({ ref: { name: 'feature', commitSha: 'other' } }) };
    release({ nodeId: 'requirements', decision: 'in-progress', summary: '还需补充', evidence: [{ path: 'docs/development/02-requirements.md', startLine: 2, endLine: 2 }], nextAction: null });
    await pending;
    expect(commit.mock.calls[0][1].branch).toBe('main');
    expect(deriveNodeView(session.config, documentSnapshot(), 'requirements', true)).toMatchObject({ status: 'done', source: 'manual' });
    expect(session.config.branches.feature).toBeUndefined();
  });

  it('does not commit a late response after cancellation, even if the adapter ignores abort', async () => {
    const session = { config: makeConfig(), snapshot: documentSnapshot() };
    let release!: (value: unknown) => void;
    const controller = new AnalysisController({ getSession: () => session, adapterFor: () => ({ analyze: () => new Promise((resolve) => { release = resolve; }) }), getModelKey: () => undefined, commit: vi.fn() });
    const pending = controller.run(controller.prepare(['requirements'], settings));
    controller.cancel();
    release({});
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('asks for a fresh preview if the selected scope changes before confirmation', async () => {
    let session = { config: makeConfig(), snapshot: documentSnapshot() };
    const analyze = vi.fn();
    const controller = new AnalysisController({ getSession: () => session, adapterFor: () => ({ analyze }), getModelKey: () => undefined, commit: vi.fn() });
    const preview = controller.prepare(['requirements'], settings);
    session = { ...session, snapshot: makeSnapshot({ ref: { name: 'feature', commitSha: 'other' } }) };
    await expect(controller.run(preview)).rejects.toThrow(/重新预览/);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('runs a confirmed workflow sequentially and stops after cancellation', async () => {
    const snapshot = makeSnapshot({ documents: [
      { path: 'docs/development/01-vision.md', blobSha: 'a', content: '# 目标\n帮助开发者', size: 20 },
      { path: 'docs/development/02-requirements.md', blobSha: 'b', content: '# 需求\n用户可以登录', size: 20 },
    ] });
    const session = { config: createProject(snapshot.repository, templates[0]), snapshot };
    let release!: (value: unknown) => void;
    const analyze = vi.fn(() => new Promise<unknown>((resolve) => { release = resolve; }));
    const commit = vi.fn();
    const controller = new AnalysisController({ getSession: () => session, adapterFor: () => ({ analyze }), getModelKey: () => undefined, commit });
    const pending = controller.run(controller.prepare(['vision', 'requirements'], settings));
    expect(analyze).toHaveBeenCalledTimes(1);
    release({ nodeId: 'vision', decision: 'done', summary: '已记录目标', evidence: [{ path: 'docs/development/01-vision.md', startLine: 2, endLine: 2 }], nextAction: null });
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    controller.cancel();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('times out an unresponsive adapter without committing a late response', async () => {
    vi.useFakeTimers();
    try {
      const session = { config: makeConfig(), snapshot: documentSnapshot() };
      const commit = vi.fn();
      const controller = new AnalysisController({ getSession: () => session, adapterFor: () => ({ analyze: () => new Promise(() => {}) }), getModelKey: () => undefined, commit });
      const pending = controller.run(controller.prepare(['requirements'], settings)).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(90_000);
      expect(String(await pending)).toContain('超过 90 秒');
      expect(commit).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
