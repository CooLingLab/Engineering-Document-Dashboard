import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useProject } from '../../src/app/useProject';
import { getBranchState } from '../../src/domain/project';
import type { GitHubReader } from '../../src/github/client';
import { GitHubError } from '../../src/github/client';
import { setManualStatus } from '../../src/workflow/status';
import { makeAnalysis } from '../fixtures';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeReader() {
  const refs = new Map<string, ReturnType<typeof deferred<{ name: string; commitSha: string }>>>();
  const reader = {
    getRepository: vi.fn(async ({ name }: { name: string }) => ({ id: name === 'second' ? 2 : 1, owner: 'example', name, defaultBranch: 'main' })),
    listBranches: vi.fn(async () => ['main', 'feature', '__proto__']),
    resolveRef: vi.fn(async (_repo: unknown, branch: string) => {
      const pending = refs.get(branch);
      return pending ? pending.promise : { name: branch, commitSha: `${branch}-sha` };
    }),
    listDirectory: vi.fn(async () => []),
    clearCache: vi.fn(),
  } as unknown as GitHubReader;
  return { reader, refs };
}

describe('project session', () => {
  it('ignores a late branch response even when the transport ignores abort', async () => {
    const { reader, refs } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => result.current.connect('example/first'));
    const feature = deferred<{ name: string; commitSha: string }>();
    refs.set('feature', feature);
    let old!: Promise<void>;
    act(() => { old = result.current.selectBranch('feature'); });
    await act(async () => result.current.selectBranch('main'));
    await act(async () => { feature.resolve({ name: 'feature', commitSha: 'old' }); await old; });
    expect(result.current.state.selectedBranch).toBe('main');
    expect(result.current.state.snapshot?.ref?.name).toBe('main');
  });

  it('retains edits made during a branch request and isolates branch status', async () => {
    const { reader, refs } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => result.current.connect('example/first'));
    const feature = deferred<{ name: string; commitSha: string }>();
    refs.set('feature', feature);
    let pending!: Promise<void>;
    act(() => { pending = result.current.selectBranch('feature'); });
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, 'main', 'domain', 'done')); });
    await act(async () => { feature.resolve({ name: 'feature', commitSha: 'new' }); await pending; });
    const config = result.current.state.config!;
    expect(getBranchState(config, 'main').manualStatuses.domain).toBe('done');
    expect(getBranchState(config, 'feature').manualStatuses).toEqual({});
    expect(getBranchState(config, '__proto__').manualStatuses).toEqual({});
    expect(result.current.state.dirty).toBe(true);
  });

  it('preserves the current branch and draft when a branch has disappeared', async () => {
    const { reader } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => result.current.connect('example/first'));
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, 'main', 'domain', 'done')); });
    vi.mocked(reader.resolveRef).mockRejectedValueOnce(new GitHubError('not-found-or-no-access', '分支无法读取'));
    await act(async () => result.current.selectBranch('feature'));
    expect(result.current.state.selectedBranch).toBe('main');
    expect(result.current.state.error).toBe('分支无法读取');
    expect(getBranchState(result.current.state.config!, 'main').manualStatuses.domain).toBe('done');
  });

  it('does not let an old repository connection overwrite a newer one', async () => {
    const { reader } = fakeReader();
    const first = deferred<{ id: number; owner: string; name: string; defaultBranch: string }>();
    vi.mocked(reader.getRepository).mockImplementationOnce(() => first.promise);
    const { result } = renderHook(() => useProject(reader));
    let old!: Promise<boolean>;
    act(() => { old = result.current.connect('example/first'); });
    await act(async () => result.current.connect('example/second'));
    await act(async () => { first.resolve({ id: 1, owner: 'example', name: 'first', defaultBranch: 'main' }); await old; });
    expect(result.current.state.config?.repository.name).toBe('second');
  });

  it('allows configuring an empty repository without inventing a branch', async () => {
    const { reader } = fakeReader();
    vi.mocked(reader.listBranches).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    expect(result.current.state.snapshot?.ref).toBeNull();
    expect(result.current.state.selectedBranch).toBeNull();
    expect(result.current.state.config?.graph.nodes.length).toBeGreaterThan(0);
    await act(async () => { await result.current.applyConfig({ ...result.current.state.config!, graph: { nodes: [], edges: [] } }); });
    expect(result.current.state.dirty).toBe(true);
  });

  it('does not clear later edits when an earlier version finishes saving', async () => {
    const { reader } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    const earlier = result.current.state.config!;
    await act(async () => { await result.current.applyConfig(setManualStatus(earlier, 'main', 'domain', 'done')); });
    act(() => result.current.markSaved(earlier));
    expect(result.current.state.dirty).toBe(true);
  });

  it('reuses unchanged documents after a code-only commit and replaces changed blobs', async () => {
    const { reader } = fakeReader();
    let sha = 'blob-1';
    let commit = 'commit-1';
    vi.mocked(reader.resolveRef).mockImplementation(async (_repo, branch) => ({ name: branch, commitSha: commit }));
    vi.mocked(reader.listDirectory).mockImplementation(async () => [{ type: 'file', path: 'docs/development/02-requirements.md', size: 3, sha }]);
    (reader as unknown as { readFile: unknown }).readFile = vi.fn(async () => ({ path: 'docs/development/02-requirements.md', blobSha: sha, content: 'abc', size: 3 }));
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    const original = result.current.state.snapshot!.documents[0];
    commit = 'commit-2';
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.snapshot!.documents[0]).toBe(original);
    sha = 'blob-2';
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.snapshot!.documents[0]).not.toBe(original);
  });
  it('stores a delayed analysis on its original special-name branch without overwriting manual changes', async () => {
    const { reader } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, '__proto__', 'domain', 'done')); });
    act(() => result.current.commitAnalysis(1, makeAnalysis({ nodeId: 'domain', branch: '__proto__', decision: 'in-progress' })));
    const branch = getBranchState(result.current.state.config!, '__proto__');
    expect(branch.manualStatuses.domain).toBe('done');
    expect(branch.analyses.domain.decision).toBe('in-progress');
    expect(result.current.state.selectedBranch).toBe('main');
  });

  it('discovers the first branch of an initially empty repository on refresh while preserving the route', async () => {
    const { reader } = fakeReader();
    vi.mocked(reader.listBranches).mockResolvedValueOnce([]).mockResolvedValueOnce(['main']);
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    const edited = { ...result.current.state.config!, graph: { nodes: [], edges: [] } };
    await act(async () => { await result.current.applyConfig(edited); });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.selectedBranch).toBe('main');
    expect(result.current.state.branches).toContain('main');
    expect(result.current.state.config?.graph.nodes).toEqual([]);
    expect(result.current.state.dirty).toBe(true);
  });

  it('keeps edits made while a new project connection is pending', async () => {
    const { reader } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    const delayed = deferred<{ id: number; owner: string; name: string; defaultBranch: string }>();
    vi.mocked(reader.getRepository).mockImplementationOnce(() => delayed.promise);
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.connect('example/second'); });
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, 'main', 'domain', 'done')); });
    await act(async () => { delayed.resolve({ id: 2, owner: 'example', name: 'second', defaultBranch: 'main' }); await pending; });
    expect(result.current.state.config?.repository.name).toBe('first');
    expect(getBranchState(result.current.state.config!, 'main').manualStatuses.domain).toBe('done');
    expect(result.current.state.error).toMatch(/保留.*草稿/);
  });
  it('keeps the live GitHub repository address when loading a configuration saved before a rename', async () => {
    const { reader } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    const old = { ...result.current.state.config!, repository: { ...result.current.state.config!.repository, owner: 'old-owner', name: 'old-name' } };
    await act(async () => { await result.current.applyLoadedConfig(old); });
    expect(result.current.state.config?.repository).toMatchObject({ id: 1, owner: 'example', name: 'first' });
    expect(result.current.state.dirty).toBe(true);
  });
  it('reconnects a renamed repository by stable ID without discarding its unsynced route', async () => {
    const { reader } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, 'main', 'domain', 'done')); });
    vi.mocked(reader.getRepository).mockResolvedValueOnce({ id: 1, owner: 'example', name: 'renamed', defaultBranch: 'main' });
    await act(async () => { await result.current.connect('example/renamed'); });
    expect(result.current.state.config?.repository.name).toBe('renamed');
    expect(getBranchState(result.current.state.config!, 'main').manualStatuses.domain).toBe('done');
    expect(result.current.state.dirty).toBe(true);
  });
  it('clears previously read document contents when repository access is revoked', async () => {
    const { reader } = fakeReader();
    vi.mocked(reader.listDirectory).mockResolvedValue([{ type: 'file', path: 'docs/development/02-requirements.md', size: 3, sha: 'blob' }]);
    (reader as unknown as { readFile: unknown }).readFile = vi.fn(async () => ({ path: 'docs/development/02-requirements.md', blobSha: 'blob', content: '私有内容', size: 3 }));
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    expect(result.current.state.snapshot?.documents).toHaveLength(1);
    vi.mocked(reader.getRepository).mockRejectedValueOnce(new GitHubError('unauthorized', '授权失效'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.snapshot?.documents).toEqual([]);
    expect(result.current.state.config).not.toBeNull();
    expect(result.current.state.error).toBe('授权失效');
  });
  it('offers newly available branches when the selected branch was deleted', async () => {
    const { reader } = fakeReader();
    vi.mocked(reader.listBranches).mockResolvedValueOnce(['main']).mockResolvedValueOnce(['develop']);
    const { result } = renderHook(() => useProject(reader));
    await act(async () => { await result.current.connect('example/first'); });
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, 'main', 'domain', 'done')); });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.state.selectedBranch).toBe('main');
    expect(result.current.state.branches).toContain('develop');
    await act(async () => { await result.current.selectBranch('develop'); });
    expect(result.current.state.selectedBranch).toBe('develop');
    expect(getBranchState(result.current.state.config!, 'main').manualStatuses.domain).toBe('done');
  });
});
