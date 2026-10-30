import { describe, expect, it, vi } from 'vitest';
import { ConfigSession } from '../../src/config/session';
import type { ConfigRepositoryGateway, SaveResult } from '../../src/config/repository';
import { makeConfig } from '../fixtures';

function gateway() {
  return {
    loadConfiguration: vi.fn(async () => ({ config: null, fileSha: null, unsupportedVersion: null })),
    saveConfiguration: vi.fn(async () => ({ kind: 'saved', fileSha: 'new' } as SaveResult)),
  } as unknown as ConfigRepositoryGateway;
}

describe('configuration session', () => {
  it('preserves edits made while a save is in flight', async () => {
    const store = gateway();
    let resolve!: (value: SaveResult) => void;
    vi.mocked(store.saveConfiguration).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const session = new ConfigSession(store, makeConfig());
    await session.load();
    session.edit(makeConfig());
    const pending = session.save();
    const edited = makeConfig();
    edited.graph.nodes[0].title = '新的修改';
    session.edit(edited);
    resolve({ kind: 'saved', fileSha: 'new' });
    await pending;
    expect(session.state.status).toBe('dirty');
    expect(session.state.config.graph.nodes[0].title).toBe('新的修改');
    expect(session.state.fileSha).toBe('new');
  });

  it('keeps drafts on conflict or permission failure and does not retry uncertain writes', async () => {
    const store = gateway();
    const session = new ConfigSession(store, makeConfig());
    await session.load();
    session.edit(makeConfig());
    vi.mocked(store.saveConfiguration).mockResolvedValueOnce({ kind: 'uncertain' });
    await session.save();
    expect(session.state.status).toBe('uncertain');
    await expect(session.save()).rejects.toThrow(/重新读取/);
    expect(store.saveConfiguration).toHaveBeenCalledTimes(1);
    expect(session.state.config).toBeTruthy();
  });

  it('never saves over an unsupported future version', async () => {
    const store = gateway();
    vi.mocked(store.loadConfiguration).mockResolvedValueOnce({ config: null, fileSha: 'old', unsupportedVersion: 99 });
    const session = new ConfigSession(store, makeConfig());
    await session.load();
    await expect(session.save()).rejects.toThrow(/新版本/);
    expect(store.saveConfiguration).not.toHaveBeenCalled();
  });

  it('retains the draft after a permission failure', async () => {
    const store = gateway();
    const draft = makeConfig();
    draft.graph.nodes[0].title = '本地草稿';
    const session = new ConfigSession(store, draft, true);
    await session.load();
    vi.mocked(store.saveConfiguration).mockRejectedValueOnce(new Error('没有写入权限'));
    await expect(session.save()).rejects.toThrow('没有写入权限');
    expect(session.state.status).toBe('error');
    expect(session.state.config.graph.nodes[0].title).toBe('本地草稿');
  });
});
