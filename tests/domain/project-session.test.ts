import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useProject } from '../../src/app/useProject';
import { getBranchState } from '../../src/domain/project';
import type { GitHubReader } from '../../src/github/client';
import { GitHubError } from '../../src/github/client';
import { setManualStatus } from '../../src/workflow/status';

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
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, 'main', 'requirements', 'done')); });
    await act(async () => { feature.resolve({ name: 'feature', commitSha: 'new' }); await pending; });
    const config = result.current.state.config!;
    expect(getBranchState(config, 'main').manualStatuses.requirements).toBe('done');
    expect(getBranchState(config, 'feature').manualStatuses).toEqual({});
    expect(getBranchState(config, '__proto__').manualStatuses).toEqual({});
    expect(result.current.state.dirty).toBe(true);
  });

  it('preserves the current branch and draft when a branch has disappeared', async () => {
    const { reader } = fakeReader();
    const { result } = renderHook(() => useProject(reader));
    await act(async () => result.current.connect('example/first'));
    await act(async () => { await result.current.applyConfig(setManualStatus(result.current.state.config!, 'main', 'requirements', 'done')); });
    vi.mocked(reader.resolveRef).mockRejectedValueOnce(new GitHubError('not-found-or-no-access', '分支无法读取'));
    await act(async () => result.current.selectBranch('feature'));
    expect(result.current.state.selectedBranch).toBe('main');
    expect(result.current.state.error).toBe('分支无法读取');
    expect(getBranchState(result.current.state.config!, 'main').manualStatuses.requirements).toBe('done');
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
    await act(async () => { await result.current.applyConfig(setManualStatus(earlier, 'main', 'requirements', 'done')); });
    act(() => result.current.markSaved(earlier));
    expect(result.current.state.dirty).toBe(true);
  });
});
