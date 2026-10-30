import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectProject } from '../components/ConnectProject';
import { ModelPanel } from '../components/ModelPanel';
import { StageDetails } from '../components/StageDetails';
import { SyncPanel } from '../components/SyncPanel';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { normalizeDocumentRoot } from '../documents/index';
import { indexDocuments } from '../documents/match';
import { getBranchState, type NodeView, type ProjectConfig } from '../domain/project';
import { GitHubReader } from '../github/client';
import { MemoryCredentials } from '../github/credentials';
import { RefreshScheduler, type RefreshState } from '../github/refresh';
import { useProject } from './useProject';
import { devflowTemplate, DEVFLOW_TEMPLATE_ID } from '../templates/catalog';
import { switchTemplate } from '../workflow/backup';
import { FixedStageNavigator } from '../components/FixedStageNavigator';
import { deriveNodeView } from '../workflow/status';
import { recommendNext } from '../workflow/recommend';
import './app.css';
import './components.css';

export default function App() {
  const credentials = useMemo(() => new MemoryCredentials(), []);
  const reader = useMemo(() => new GitHubReader({ fetcher: fetch, credentials, credentialSlot: 'target' }), [credentials]);
  const session = useProject(reader);
  const { config, snapshot, branches, selectedNodeId, busy, error, dirty } = session.state;
  const selectedBranch = session.state.selectedBranch ?? '';
  const setSelectedNodeId = session.selectNode;
  const setError = session.setError;
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showConnect, setShowConnect] = useState(true);
  const [connectionCount, setConnectionCount] = useState(0);
  const [documentRoot, setDocumentRoot] = useState('docs/development');
  const [refreshState, setRefreshState] = useState<RefreshState | null>(null);
  const scheduler = useRef<RefreshScheduler | null>(null);
  const refreshCallback = useRef(session.refresh);
  refreshCallback.current = session.refresh;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const credentialVersion = credentials.version('target');
  useEffect(() => {
    if (!config) { setRefreshState(null); return; }
    const current = new RefreshScheduler({ now: Date.now, refresh: () => refreshCallback.current(true), onChange: setRefreshState });
    scheduler.current = current;
    setRefreshState(null);
    const update = () => current.update({ visible: document.visibilityState === 'visible' && !busyRef.current,
      authenticated: Boolean(credentials.get('target')) });
    const focus = () => current.focus();
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', focus);
    return () => { current.stop(); if (scheduler.current === current) scheduler.current = null;
      document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', focus); };
  }, [config?.repository.id, selectedBranch, credentials, credentialVersion]);
  useEffect(() => {
    scheduler.current?.update({ visible: document.visibilityState === 'visible' && !busy, authenticated: Boolean(credentials.get('target')) });
  }, [busy, credentials, credentialVersion]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function connect(input: string, token: string) {
    if (dirty && !window.confirm('当前流程有尚未同步的修改。重新连接同一仓库会保留草稿；切换到其他仓库会丢失草稿，请先保存。确定继续吗？')) return;
    const previousToken = credentials.get('target');
    credentials.set('target', token || undefined);
    if (await session.connect(input)) {
      setShowConnect(false); setDocumentRoot(session.getState().config?.documentRules.root ?? devflowTemplate.documentRules.root); setAiEnabled(false); setConnectionCount((value) => value + 1);
    } else credentials.set('target', previousToken);
  }

  async function applyConfigChange(next: ProjectConfig) {
    if (!config) return;
    if (await session.applyConfig(next)) setDocumentRoot(next.documentRules.root);
  }

  function adoptStandardWorkflow() {
    if (!config || busy) return;
    if (!window.confirm('将当前流程替换为固定八阶段 V3，旧流程与各分支状态会存入备份。此操作不会修改目标仓库。确定继续吗？')) return;
    try {
      const next = switchTemplate(config, devflowTemplate, new Date());
      void applyConfigChange(next).then(() => setSelectedNodeId(next.graph.nodes[0]?.id ?? null));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '切换标准流程失败。');
    }
  }

  function changeDirectory() {
    if (!config) return;
    try {
      const next = structuredClone(config);
      next.documentRules.root = normalizeDocumentRoot(documentRoot);
      setError(null);
      void applyConfigChange(next);
    } catch (changeError) { setError(changeError instanceof Error ? changeError.message : '文档目录无效。'); }
  }

  const documentIndex = useMemo(() => config && snapshot ? indexDocuments(config, snapshot) : null, [config, snapshot]);
  const nodeViews: Record<string, NodeView> = Object.fromEntries((config?.graph.nodes ?? []).map((node) => [node.id,
    config && snapshot ? deriveNodeView(config, snapshot, node.id, aiEnabled) : { status: 'unknown', source: 'none', analysis: 'absent' }]));
  const recommendation = config && snapshot && documentIndex ? recommendNext(config, snapshot, documentIndex, aiEnabled) : null;

  return <div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <a className="brand" href="#home"><span className="brand-mark">▦</span><span>开发路线<small>DEVELOPMENT DASHBOARD</small></span></a>
      <div className="sidebar-section">工作空间</div><div className="nav-active"><span>▤</span> 项目概览</div>
      <div className="sidebar-hint"><strong>第一次开发？</strong><p>从一条路线开始，一步一步把想法变成现实。</p></div>
    </aside>
    <main id="home" className="main-content">
      <header className="topbar"><span>工作空间 <span className="muted">/ 项目概览</span></span><button type="button" className="beginner-pill" onClick={() => setBeginnerMode(!beginnerMode)} aria-pressed={beginnerMode}>✦ 新手模式{beginnerMode ? '已开启' : '已关闭'}</button></header>
      <div className={`page-content${config ? ' is-connected' : ''}`}>
        <div className="eyebrow"><span className="eyebrow-dot" /> 从这里开始</div>
        <h1>让每一步开发，都<span>清晰可见。</span></h1>
        <p className="intro">连接你的 GitHub 项目，把散落的文档和开发进度放到一张路线图上。</p>
        {config && snapshot && <div className="project-bar"><div><span className="project-label">当前项目{dirty ? ' · 有未同步修改' : ''}</span><strong>{config.repository.owner}/{config.repository.name}</strong></div><div className="project-controls"><label htmlFor="branch-select">分支</label><select id="branch-select" aria-label="当前分支" value={selectedBranch} onChange={(event) => void session.selectBranch(event.target.value)} disabled={busy || !branches.length}>{!selectedBranch && <option value="">尚无分支</option>}{selectedBranch && !branches.includes(selectedBranch) && <option value={selectedBranch}>{selectedBranch}（不可用）</option>}{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select><button type="button" className="refresh-button" disabled={busy || Boolean(refreshState?.nextRetryAt && Date.now() < refreshState.nextRetryAt)} onClick={() => void (scheduler.current?.refreshNow() ?? session.refresh())}>刷新文档</button><button type="button" className="refresh-button" onClick={() => setShowConnect(!showConnect)}>{showConnect ? '收起连接' : '更换项目'}</button></div></div>}
        {snapshot?.ref && <p className="refresh-info">上次读取：{new Date(refreshState?.lastCheckedAt ?? snapshot.fetchedAt).toLocaleString()} · 版本 {snapshot.ref.commitSha.slice(0, 7)}{refreshState?.pausedReason ? ` · ${refreshState.pausedReason}` : ''}</p>}
        {showConnect && <ConnectProject onConnect={connect} busy={busy} error={error} />}
        {!showConnect && error && <p className="connection-error" role="alert">{error}</p>}
        {config && snapshot && <details className="directory-settings"><summary>文档目录：{config.documentRules.root} · 修改文档目录</summary><form onSubmit={(event) => { event.preventDefault(); changeDirectory(); }}><label>文档目录<input value={documentRoot} onChange={(event) => setDocumentRoot(event.target.value)} /></label><button type="submit" className="secondary-button" disabled={busy}>应用目录</button></form></details>}
        {config && <SyncPanel key={`sync-${config.repository.id}-${connectionCount}`} config={config} dirty={dirty} credentials={credentials} fetcher={fetch}
          onLoaded={async (loaded) => { const applied = await session.applyLoadedConfig(loaded); if (applied) { setDocumentRoot(loaded.documentRules.root); } return applied; }}
          onSaved={session.markSaved} />}
        {config && snapshot && <ModelPanel key={`model-${config.repository.id}-${connectionCount}`} config={config} snapshot={snapshot} selectedNodeId={selectedNodeId}
          credentials={credentials} fetcher={fetch} onEnabledChange={setAiEnabled} onCommit={session.commitAnalysis} />}
        {snapshot?.issues.map((issue, index) => <p key={`${issue.path}-${index}`} className="scan-issue" role="status">{issue.message}</p>)}
        <section className="route-intro" aria-labelledby="route-title"><div><div className="section-kicker">STANDARD AI DEVELOPMENT LIFECYCLE · V3</div><h2 id="route-title">固定八阶段开发路线</h2><p>主干固定，按阶段管理文档、状态和验收；不适用的阶段可手动跳过。</p></div><span className="recommended">标准流程</span></section>
        {config && config.template?.id !== DEVFLOW_TEMPLATE_ID && <div className="standard-migration" role="status"><div><strong>当前仓库仍在使用旧版自定义流程</strong><p>可以切换到标准八阶段。旧流程与分支记录会自动备份，迁移后不会自动覆盖 GitHub 配置。</p></div><button type="button" className="secondary-button" disabled={busy || config.backups.length >= 10} onClick={adoptStandardWorkflow}>切换到八阶段 V3</button>{config.backups.length >= 10 && <small>备份已满，请先处理历史备份。</small>}</div>}
        {config && snapshot && documentIndex ? <>
          <div className="next-step"><span>✦</span><div><strong>建议下一步</strong><p>{recommendation?.reason}</p>{recommendation?.nodeId && <button type="button" className="suggestion-link" onClick={() => setSelectedNodeId(recommendation.nodeId)}>查看建议环节 →</button>}</div></div>
          <div className="desktop-workflow-canvas"><WorkflowCanvas graph={config.graph} nodeViews={nodeViews} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} documentIndex={documentIndex} documentChoices={getBranchState(config, snapshot.ref?.name ?? '').documentChoices} /></div>
          <FixedStageNavigator graph={config.graph} nodeViews={nodeViews} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          {selectedNodeId && <StageDetails config={config} snapshot={snapshot} nodeId={selectedNodeId} documentIndex={documentIndex} beginnerMode={beginnerMode} aiEnabled={aiEnabled} onChangeConfig={(next) => void applyConfigChange(next)} />}
        </> : <div className="route-preview" aria-label="AI 开发八阶段">{devflowTemplate.graph.nodes.map((node, index) => <div className="route-step" key={node.id}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><strong>{node.title}</strong><small>等待连接</small></div>)}</div>}
        <div className="footer-note">✳ 你的文档留在原来的仓库中，我们只读取它们。</div>
      </div>
    </main>
  </div>;
}
