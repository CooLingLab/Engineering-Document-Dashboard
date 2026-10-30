import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshScheduler } from '../../src/github/refresh';
import { GitHubError } from '../../src/github/client';

describe('document refresh scheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-30T00:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('checks authenticated sessions after 60 seconds and public sessions after 5 minutes', async () => {
    const refresh = vi.fn(async () => {});
    const scheduler = new RefreshScheduler({ now: Date.now, refresh });
    scheduler.update({ visible: true, authenticated: true });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.update({ visible: true, authenticated: false });
    await vi.advanceTimersByTimeAsync(299_999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('pauses while hidden, respects focus intervals, and stops permanently', async () => {
    const refresh = vi.fn(async () => {});
    const scheduler = new RefreshScheduler({ now: Date.now, refresh });
    scheduler.update({ visible: true, authenticated: true });
    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.focus();
    expect(refresh).not.toHaveBeenCalled();
    scheduler.update({ visible: false, authenticated: true });
    await vi.advanceTimersByTimeAsync(80_000);
    expect(refresh).not.toHaveBeenCalled();
    scheduler.update({ visible: true, authenticated: true });
    scheduler.focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(500_000);
    await scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('deduplicates manual refresh and respects rate-limit retry time', async () => {
    let release!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const scheduler = new RefreshScheduler({ now: Date.now, refresh });
    scheduler.update({ visible: true, authenticated: true });
    const one = scheduler.refreshNow();
    const two = scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([one, two]);
    refresh.mockRejectedValueOnce(new GitHubError('rate-limited', '限流', Date.now() + 180_000));
    await scheduler.refreshNow();
    await vi.advanceTimersByTimeAsync(179_999);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(3);
    scheduler.stop();
    release();
  });

  it('does not keep polling a revoked or deleted repository', async () => {
    const refresh = vi.fn(async () => { throw new GitHubError('not-found-or-no-access', '无权限'); });
    const scheduler = new RefreshScheduler({ now: Date.now, refresh });
    scheduler.update({ visible: true, authenticated: true });
    await scheduler.refreshNow();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
