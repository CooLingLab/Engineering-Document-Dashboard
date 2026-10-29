import { useState, type FormEvent } from 'react';

export type ConnectProjectProps = { onConnect: (repository: string, token: string) => void; busy: boolean; error: string | null };

export function ConnectProject({ onConnect, busy, error }: ConnectProjectProps) {
  const [repository, setRepository] = useState('');
  const [token, setToken] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (repository.trim()) onConnect(repository, token);
  }

  return <section className="connect-card" aria-labelledby="connect-title">
    <div className="card-icon">↗</div>
    <form className="connect-body" onSubmit={submit}>
      <h2 id="connect-title">连接你的项目</h2>
      <p>输入 GitHub 仓库地址，开始探索你的开发路线。</p>
      <label htmlFor="repo-url">GitHub 仓库地址</label>
      <div className="connect-row"><input id="repo-url" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="https://github.com/owner/repository" autoComplete="url" /><button type="submit" disabled={busy || !repository.trim()}>{busy ? '连接中…' : '连接仓库'} <span>→</span></button></div>
      <details className="authorization"><summary>私有仓库授权（可选）</summary><label htmlFor="repo-token">GitHub 读取令牌</label><input id="repo-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" placeholder="仅保存在当前页面" /><small>需要目标仓库的 Contents 读取权限。关闭或刷新页面后需要重新输入。</small></details>
      <small>公开仓库可直接连接 · 私有仓库需要授权</small>
      {error && <p className="connection-error" role="alert">{error}</p>}
    </form>
  </section>;
}
