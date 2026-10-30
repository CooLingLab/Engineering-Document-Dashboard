import { useEffect, useMemo, useState } from 'react';
import { ConnectProject } from '../components/ConnectProject';
import { StageDetails } from '../components/StageDetails';
import { SyncPanel } from '../components/SyncPanel';
import { TemplatePicker } from '../components/TemplatePicker';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { WorkflowEditor } from '../components/WorkflowEditor';
import { normalizeDocumentRoot } from '../documents/index';
import { indexDocuments } from '../documents/match';
import { type NodeView, type ProjectConfig } from '../domain/project';
import { GitHubReader } from '../github/client';
import { MemoryCredentials } from '../github/credentials';
import { useProject } from './useProject';
import { templates } from '../templates/catalog';
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
  const [showConnect, setShowConnect] = useState(true);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<ProjectConfig[]>([]);
  const [documentRoot, setDocumentRoot] = useState('docs/development');
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function connect(input: string, token: string) {
    if (dirty && !window.confirm('当前流程有尚未同步的修改。要保留它们，请先取消并在“配置同步”中保存；切换项目会丢失这些修改。确定继续切换吗？')) return;
    const previousToken = credentials.get('target');
    credentials.set('target', token || undefined);
    if (await session.connect(input)) {
      setShowConnect(false); setEditing(false); setHistory([]); setDocumentRoot(templates[0].documentRules.root);
    } else credentials.set('target', previousToken);
  }

  async function applyConfigChange(next: ProjectConfig, mode: 'push' | 'undo' = 'push') {
    if (!config) return;
    const previous = config;
    const previousHistory = history;
    setHistory((items) => mode === 'undo' ? items.slice(0, -1) : [...items.slice(-19), structuredClone(previous)]);
    if (await session.applyConfig(next)) {
      setDocumentRoot(next.documentRules.root);
    } else setHistory(previousHistory);
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

  function undo() {
    const previous = history.at(-1);
    if (previous) void applyConfigChange(previous, 'undo');
  }

  const documentIndex = useMemo(() => config && snapshot ? indexDocuments(config, snapshot) : null, [config, snapshot]);
  const nodeViews: Record<string, NodeView> = Object.fromEntries((config?.graph.nodes ?? []).map((node) => [node.id,
    config && snapshot ? deriveNodeView(config, snapshot, node.id, false) : { status: 'unknown', source: 'none', analysis: 'absent' }]));
  const recommendation = config && snapshot && documentIndex ? recommendNext(config, snapshot, documentIndex, false) : null;

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
        {config && snapshot && <div className="project-bar"><div><span className="project-label">当前项目{dirty ? ' · 有未同步修改' : ''}</span><strong>{config.repository.owner}/{config.repository.name}</strong></div><div className="project-controls"><label htmlFor="branch-select">分支</label><select id="branch-select" aria-label="当前分支" value={selectedBranch} onChange={(event) => void session.selectBranch(event.target.value)} disabled={busy || !branches.length}>{!branches.length && <option value={selectedBranch}>{selectedBranch || '尚无分支'}</option>}{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select><button type="button" className="refresh-button" disabled={busy || !selectedBranch} onClick={() => void session.refresh()}>刷新文档</button><button type="button" className="refresh-button" onClick={() => setShowConnect(!showConnect)}>{showConnect ? '收起连接' : '更换项目'}</button></div></div>}
        {showConnect && <ConnectProject onConnect={connect} busy={busy} error={error} />}
        {!showConnect && error && <p className="connection-error" role="alert">{error}</p>}
        {config && snapshot && <details className="directory-settings"><summary>文档目录：{config.documentRules.root} · 修改文档目录</summary><form onSubmit={(event) => { event.preventDefault(); changeDirectory(); }}><label>文档目录<input value={documentRoot} onChange={(event) => setDocumentRoot(event.target.value)} /></label><button type="submit" className="secondary-button" disabled={busy}>应用目录</button></form></details>}
        {config && <SyncPanel key={config.repository.id} config={config} dirty={dirty} credentials={credentials} fetcher={fetch}
          onLoaded={async (loaded) => { const applied = await session.applyConfig(loaded); if (applied) { session.markSaved(loaded); setDocumentRoot(loaded.documentRules.root); setHistory([]); } return applied; }}
          onSaved={session.markSaved} />}
        {snapshot?.issues.map((issue, index) => <p key={`${issue.path}-${index}`} className="scan-issue" role="status">{issue.message}</p>)}
        <section className="route-intro" aria-labelledby="route-title"><div><div className="section-kicker">YOUR DEVELOPMENT JOURNEY</div><h2 id="route-title">你的开发路线</h2><p>不必一次完成所有事情。先看全貌，再从眼前的一步开始。</p></div>{config ? <button type="button" className="secondary-button" onClick={() => setEditing(!editing)}>{editing ? '完成编辑' : '编辑流程'}</button> : <span className="recommended">推荐路线</span>}</section>
        {config && snapshot && documentIndex ? <><div className="next-step"><span>✦</span><div><strong>建议下一步</strong><p>{recommendation?.reason}</p>{recommendation?.nodeId && <button type="button" className="suggestion-link" onClick={() => setSelectedNodeId(recommendation.nodeId)}>查看建议环节 →</button>}</div></div><WorkflowCanvas graph={config.graph} nodeViews={nodeViews} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} onGraphChange={editing && !busy ? (graph) => void applyConfigChange({ ...config, graph }) : undefined} documentIndex={documentIndex} />{editing && <fieldset className="editing-container" disabled={busy}><WorkflowEditor config={config} selectedNodeId={selectedNodeId} documentIndex={documentIndex} onChange={(next) => void applyConfigChange(next)} onSelectNode={setSelectedNodeId} onUndo={undo} canUndo={history.length > 0} /><TemplatePicker config={config} onChange={(next) => void applyConfigChange(next)} onSelectNode={setSelectedNodeId} /></fieldset>}{selectedNodeId && <StageDetails config={config} snapshot={snapshot} nodeId={selectedNodeId} documentIndex={documentIndex} beginnerMode={beginnerMode} onChangeConfig={(next) => void applyConfigChange(next)} />}</> : <div className="route-preview" aria-label="通用应用开发流程">{templates[0].graph.nodes.map((node, index) => <div className="route-step" key={node.id}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><strong>{node.title}</strong><small>等待连接</small></div>)}</div>}
        <div className="footer-note">✳ 你的文档留在原来的仓库中，我们只读取它们。</div>
      </div>
    </main>
  </div>;
}
