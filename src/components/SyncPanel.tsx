import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ConfigRepositoryGateway } from '../config/repository';
import { ConfigSession, type SyncStatus } from '../config/session';
import type { ProjectConfig } from '../domain/project';
import { GitHubReader } from '../github/client';
import type { MemoryCredentials } from '../github/credentials';
import { parseRepositoryInput } from '../github/repository';

type Props = { config: ProjectConfig; dirty: boolean; credentials: MemoryCredentials; fetcher: typeof fetch;
  onLoaded: (config: ProjectConfig) => Promise<boolean>; onSaved: (config: ProjectConfig) => void };
const statusText: Record<SyncStatus, string> = {
  clean: '配置已读取', dirty: '有未同步修改', saving: '正在保存', saved: '已保存到 GitHub',
  error: '同步失败，草稿仍在本页面', conflict: '远端配置已变化，请重新读取；本地草稿仍在',
  uncertain: '保存结果不确定，请先重新读取远端；本地草稿仍在',
};

export function SyncPanel({ config, dirty, credentials, fetcher, onLoaded, onSaved }: Props) {
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const [store, setStore] = useState<ConfigSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [version, render] = useState(0);
  const latest = useRef({ config, dirty });
  latest.current = { config, dirty };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; credentials.set('config', undefined); }; }, [credentials]);
  useEffect(() => {
    if (store && store.state.config !== config) { store.edit(config); render((n) => n + 1); }
  }, [config, store]);

  async function loadInto(next: ConfigSession) {
    const before = latest.current.config;
    const loaded = await next.load();
    if (!mounted.current) return false;
    if (before !== latest.current.config) throw new Error('读取期间本地流程已更改，保留本地草稿。');
    if (loaded.unsupportedVersion !== null) {
      setMessage(`远端配置版本 ${loaded.unsupportedVersion} 较新，只能查看，不能覆盖。`);
      return true;
    }
    if (!loaded.config) { setMessage('配置仓库中尚无配置；可保存当前路线。'); return true; }
    if (latest.current.dirty && !window.confirm('远端已有配置。加载它会替换当前未同步的修改，确定加载吗？')) {
      setMessage('已保留当前草稿。要保存前，请先决定是否加载远端配置。');
      return false;
    }
    if (!await onLoaded(loaded.config)) throw new Error('无法应用远端配置，请检查文档目录。');
    setMessage('已加载 GitHub 上的配置。');
    return true;
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    const previousToken = credentials.get('config');
    try {
      const input = parseRepositoryInput(address);
      credentials.set('config', token || undefined);
      const reader = new GitHubReader({ fetcher, credentials, credentialSlot: 'config' });
      let repository;
      try { repository = await reader.getRepository(input); } finally { reader.dispose(); }
      if (repository.id === config.repository.id) throw new Error('请使用独立的配置仓库，不能写入目标项目。');
      const gateway = new ConfigRepositoryGateway({ repository, branch: repository.defaultBranch }, { fetcher, credentials });
      const info = await gateway.inspect();
      if (!info.isPrivate && !window.confirm('配置仓库是公开的，项目名称、状态和分析摘要可能被所有人看到。确定继续吗？')) {
        credentials.set('config', previousToken); return;
      }
      const next = new ConfigSession(gateway, latest.current.config, latest.current.dirty);
      if (await loadInto(next) && mounted.current) setStore(next);
      else credentials.set('config', previousToken);
    } catch (error) {
      credentials.set('config', previousToken);
      if (mounted.current) setMessage(error instanceof Error ? error.message : '连接配置仓库失败。');
    } finally { if (mounted.current) setBusy(false); }
  }

  async function reload() {
    if (!store) return;
    setBusy(true); setMessage('');
    try {
      const next = store;
      if (!await loadInto(next)) setStore(null);
    } catch (error) { setStore(null); setMessage(error instanceof Error ? error.message : '读取配置失败。'); }
    finally { if (mounted.current) { setBusy(false); render((n) => n + 1); } }
  }

  async function save() {
    if (!store) return;
    const savedConfig = latest.current.config;
    if (store.state.config !== savedConfig) store.edit(savedConfig);
    setBusy(true); setMessage('');
    try {
      const pending = store.save(); render((n) => n + 1);
      const result = await pending;
      if (!mounted.current) return;
      if (result.kind === 'saved' && latest.current.config === savedConfig) onSaved(savedConfig);
      setMessage(statusText[store.state.status]);
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : '保存失败，草稿仍在。'); }
    finally { if (mounted.current) { setBusy(false); render((n) => n + 1); } }
  }
  void version;
  return <details id="workflow-sync-panel" className="directory-settings"><summary>配置同步 · {dirty ? '有未同步修改' : '跨设备保存'}</summary>
    <p>连接你单独创建的配置仓库；仅在点击保存后写入，不主动保存文档正文或令牌。模型摘要可能复述文档内容，过滤无法保证完全识别；建议使用私有仓库并在保存前检查。</p>
    <form onSubmit={(event) => void connect(event)}>
      <label>配置仓库地址<input aria-label="配置仓库地址" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="owner/config-repository" /></label>
      <label>配置仓库令牌<input aria-label="配置仓库令牌" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
      <button type="submit" className="secondary-button" disabled={busy || !address.trim() || !token}>连接配置仓库</button>
    </form>
    <small>令牌仅在当前页面使用，需要配置仓库的 Contents 读写权限。</small>
    {store && <div className="project-controls"><button type="button" className="secondary-button" disabled={busy} onClick={() => void reload()}>重新读取配置</button>
      <button type="button" className="secondary-button" disabled={busy || store.state.unsupportedVersion !== null || store.state.status === 'conflict' || store.state.status === 'uncertain'} onClick={() => void save()}>保存到 GitHub</button>
      <span>{statusText[store.state.status]}</span></div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
