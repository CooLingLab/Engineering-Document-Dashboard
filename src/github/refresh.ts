import { GitHubError } from './client';

export type RefreshState = { lastCheckedAt: number | null; nextRetryAt: number | null; pausedReason: string | null };
export class RefreshScheduler {
  #now: () => number;
  #refresh: () => Promise<void>;
  #onChange?: (state: RefreshState) => void;
  #visible = false;
  #authenticated = false;
  #stopped = false;
  #lastAttempt: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending: Promise<void> | null = null;
  #terminal = false;
  state: RefreshState = { lastCheckedAt: null, nextRetryAt: null, pausedReason: null };

  constructor(options: { now: () => number; refresh: () => Promise<void>; onChange?: (state: RefreshState) => void }) {
    this.#now = options.now; this.#refresh = options.refresh; this.#onChange = options.onChange;
    this.#lastAttempt = this.#now();
  }
  #interval() { return this.#authenticated ? 60_000 : 300_000; }
  #publish() { if (!this.#stopped) this.#onChange?.({ ...this.state }); }
  #schedule() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#stopped || !this.#visible || this.#terminal || this.#pending) return;
    const due = Math.max(this.#lastAttempt + this.#interval(), this.state.nextRetryAt ?? 0);
    this.#timer = setTimeout(() => { void this.refreshNow(); }, Math.max(0, due - this.#now()));
  }
  update({ visible, authenticated }: { visible: boolean; authenticated: boolean }) {
    if (this.#stopped) return;
    this.#visible = visible; this.#authenticated = authenticated;
    this.#schedule();
  }
  focus() {
    if (!this.#stopped && this.#visible && !this.#terminal && this.#now() >= this.#lastAttempt + this.#interval() &&
      this.#now() >= (this.state.nextRetryAt ?? 0)) void this.refreshNow();
  }
  refreshNow(): Promise<void> {
    if (this.#stopped) return Promise.resolve();
    if (this.#pending) return this.#pending;
    if (this.state.nextRetryAt && this.#now() < this.state.nextRetryAt) return Promise.resolve();
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#terminal = false;
    this.#lastAttempt = this.#now();
    this.#pending = (async () => {
      try {
        await this.#refresh();
        this.state = { lastCheckedAt: this.#now(), nextRetryAt: null, pausedReason: null };
      } catch (error) {
        if (error instanceof GitHubError && error.kind === 'rate-limited') {
          this.state = { ...this.state, nextRetryAt: error.retryAt ?? this.#now() + this.#interval(), pausedReason: 'GitHub 请求达到限制，稍后自动重试。' };
        } else if (error instanceof GitHubError && ['unauthorized', 'forbidden', 'not-found-or-no-access'].includes(error.kind)) {
          this.#terminal = true;
          this.state = { ...this.state, nextRetryAt: null, pausedReason: '无法访问仓库或分支，自动刷新已暂停。' };
        } else {
          this.state = { ...this.state, nextRetryAt: this.#now() + this.#interval(), pausedReason: '刷新失败，将稍后重试。' };
        }
      } finally {
        this.#pending = null; this.#publish(); this.#schedule();
      }
    })();
    return this.#pending;
  }
  stop() { this.#stopped = true; if (this.#timer) clearTimeout(this.#timer); this.#timer = undefined; }
}
