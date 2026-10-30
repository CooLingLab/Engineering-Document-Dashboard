import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentIndex } from '../documents/match';
import type { DocumentChoice, NodeView, ProjectConfig, WorkflowNode } from '../domain/project';
import { applyGraphCommand, type GraphCommand } from '../workflow/graph';
import { WorkflowCanvas } from './WorkflowCanvas';

type Props = {
  config: ProjectConfig;
  selectedNodeId: string | null;
  nodeViews: Record<string, NodeView>;
  documentIndex: DocumentIndex;
  documentChoices: Record<string, DocumentChoice>;
  onChange: (config: ProjectConfig) => void;
  onSelectNode: (id: string | null) => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled?: boolean;
  dirty?: boolean;
};

export function MobileWorkflowEditor({
  config, selectedNodeId, nodeViews, documentIndex, documentChoices,
  onChange, onSelectNode, onUndo, canUndo, disabled, dirty,
}: Props) {
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [addingAfter, setAddingAfter] = useState<string | null | undefined>(undefined);
  const [newTitle, setNewTitle] = useState('');
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [nextId, setNextId] = useState('');
  const [docPath, setDocPath] = useState('');
  const [docRule, setDocRule] = useState('new');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);

  const nodes = useMemo(() => [...config.graph.nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)), [config.graph.nodes]);
  const node = config.graph.nodes.find((item) => item.id === sheetId);
  const outgoing = node ? config.graph.edges.filter((edge) => edge.source === node.id) : [];
  const expected = node ? config.documentRules.expected.filter((item) => item.nodeId === node.id) : [];
  const paths = useMemo(() => [...new Set([
    ...documentIndex.others.map((document) => document.path),
    ...documentIndex.matches.filter((match) => match.kind !== 'missing').flatMap((match) => match.paths),
  ])].sort(), [documentIndex]);

  useEffect(() => {
    setTitle(node?.title ?? '');
    setWhy(node?.guidance.why ?? '');
    setNextId('');
    setDocPath('');
    setDocRule('new');
    setConfirmDelete(false);
    setError('');
  }, [node?.id, node?.title, node?.guidance.why]);

  useEffect(() => {
    if (sheetId) closeButton.current?.focus();
  }, [sheetId]);

  useEffect(() => {
    if (!sheetId) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetId(null);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [sheetId]);

  function run(command: GraphCommand): ProjectConfig | undefined {
    if (disabled) return;
    try {
      const next = applyGraphCommand(config, command);
      setError('');
      onChange(next);
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败。');
    }
  }

  function openNode(id: string) {
    setAddingAfter(undefined);
    setSheetId(id);
    onSelectNode(id);
  }

  function move(id: string, offset: -1 | 1) {
    const ids = nodes.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = from + offset;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    run({ type: 'reorder-nodes', ids });
  }

  function add() {
    const value = newTitle.trim();
    if (!value) { setError('请填写环节名称。'); return; }
    const index = addingAfter === null ? nodes.length : nodes.findIndex((item) => item.id === addingAfter) + 1;
    if (index < 0) { setError('插入位置已失效，请重试。'); return; }
    const id = `stage-${crypto.randomUUID()}`;
    const item: WorkflowNode = {
      id, title: value, order: nodes.length,
      position: { x: 40 + nodes.length * 220, y: 120 },
      guidance: { why: '记录这个环节的目的。', action: '查看或关联这个环节的文档。', checks: [] },
      promptIds: [],
    };
    try {
      const withNode = applyGraphCommand(config, { type: 'add-node', node: item });
      const ids = nodes.map((node) => node.id);
      ids.splice(index, 0, id);
      const next = applyGraphCommand(withNode, { type: 'reorder-nodes', ids });
      onChange(next);
      setNewTitle('');
      setAddingAfter(undefined);
      setError('');
      openNode(id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法添加环节。'); }
  }

  function saveNode() {
    if (!node) return;
    const name = title.trim();
    if (!name) { setError('环节名称不能为空。'); return; }
    const next = structuredClone(config);
    const changed = next.graph.nodes.find((item) => item.id === node.id)!;
    changed.title = name;
    changed.guidance.why = why.trim() || '记录这个环节的目的。';
    onChange(next);
    setError('');
    setSheetId(null);
  }

  function addConnection() {
    if (!node || !nextId) { setError('请选择要连接的环节。'); return; }
    run({ type: 'add-edge', edge: { id: `edge-${crypto.randomUUID()}`, source: node.id, target: nextId } });
    setNextId('');
  }

  function linkDocument() {
    if (!node || !docPath || !paths.includes(docPath)) { setError('请选择已有的 Markdown 文档。'); return; }
    const next = structuredClone(config);
    let ruleId = docRule;
    if (ruleId === 'new') {
      ruleId = `${node.id}-doc-${crypto.randomUUID()}`;
      next.documentRules.expected.push({ id: ruleId, nodeId: node.id, fileName: docPath.split('/').at(-1)! });
    } else if (!expected.some((item) => item.id === ruleId)) {
      setError('请选择有效的文档位置。');
      return;
    }
    next.documentRules.bindings[ruleId] = docPath;
    onChange(next);
    setDocPath('');
    setError('');
  }

  function removeNode() {
    if (!node) return;
    const next = run({ type: 'remove-node', id: node.id });
    if (next) {
      setSheetId(null);
      onSelectNode(next.graph.nodes[0]?.id ?? null);
    }
  }

  return <section className="mobile-editor-root" aria-label="手机端流程编辑器">
    <div className="mobile-editor-toolbar">
      <div className="mobile-view-switch" role="group" aria-label="编辑视图">
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>列表编辑</button>
        <button type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')}>流程图预览</button>
      </div>
      <div className="mobile-editor-tools">
        <button type="button" disabled={!canUndo || disabled} onClick={onUndo}>撤销</button>
        <button type="button" disabled={disabled || !nodes.length} onClick={() => run({ type: 'auto-layout' })}>自动排版</button>
      </div>
    </div>
    {view === 'graph' ? <div className="mobile-graph-preview">
      <WorkflowCanvas graph={config.graph} nodeViews={nodeViews} selectedNodeId={selectedNodeId}
        onSelectNode={openNode} documentIndex={documentIndex} documentChoices={documentChoices} />
      <p>轻触节点编辑。预览可以双指缩放，位置请使用“自动排版”或电脑端画布调整。</p>
    </div> : <>
      <p className="mobile-editor-help">点按环节即可修改名称、说明、连线和文档；上下箭头调整显示顺序，不会修改现有依赖关系。</p>
      <ol className="mobile-stage-list">
        {nodes.map((item, index) => <li key={item.id} className="mobile-stage-row">
          <div className="mobile-stage-card">
            <button type="button" className="mobile-stage-main" onClick={() => openNode(item.id)}>
              <span className="mobile-stage-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="mobile-stage-text"><strong>{item.title}</strong>
                <small>{nodeViews[item.id]?.status === 'done' ? '已完成' : nodeViews[item.id]?.status === 'in-progress' ? '进行中' : '点按编辑环节'}</small>
              </span><span aria-hidden="true">✎</span>
            </button>
            <div className="mobile-order-buttons">
              <button type="button" aria-label={`上移${item.title}`} disabled={disabled || index === 0} onClick={() => move(item.id, -1)}>↑</button>
              <button type="button" aria-label={`下移${item.title}`} disabled={disabled || index === nodes.length - 1} onClick={() => move(item.id, 1)}>↓</button>
            </div>
          </div>
          <button type="button" className="mobile-insert-button" disabled={disabled} onClick={() => { setAddingAfter(item.id); setNewTitle(''); setError(''); }}>＋ 在这里插入</button>
        </li>)}
      </ol>
      {addingAfter !== undefined && <form className="mobile-add-form" onSubmit={(event) => { event.preventDefault(); add(); }}>
        <label htmlFor="mobile-new-stage">新环节名称</label>
        <input id="mobile-new-stage" autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="例如：UI Prototype" />
        <div className="mobile-form-actions"><button type="button" onClick={() => { setAddingAfter(undefined); setError(''); }}>取消</button><button type="submit" disabled={disabled || !newTitle.trim()}>添加</button></div>
      </form>}
      <button type="button" className="mobile-add-main" disabled={disabled} onClick={() => { setAddingAfter(null); setNewTitle(''); setError(''); }}>＋ 添加新环节</button>
    </>}
    {dirty && <div className="mobile-unsaved-notice" role="status">
      <span>修改仅在当前页面，离开前请同步到 GitHub。</span>
      <button type="button" onClick={() => {
        const panel = document.getElementById('workflow-sync-panel') as HTMLDetailsElement | null;
        if (panel) { panel.open = true; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }}>前往保存</button>
    </div>}
    {!node && error && <p className="connection-error" role="alert">{error}</p>}
    {node && <div className="mobile-sheet-layer">
      <button type="button" className="mobile-sheet-backdrop" aria-label="关闭编辑面板" onClick={() => setSheetId(null)} />
      <section className="mobile-stage-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title">
        <div className="mobile-sheet-heading"><h3 id="mobile-sheet-title">编辑环节</h3><button type="button" ref={closeButton} onClick={() => setSheetId(null)}>完成 / 关闭</button></div>
        <div className="mobile-sheet-body">
          <label>名称<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>环节目的<textarea rows={2} value={why} onChange={(event) => setWhy(event.target.value)} /></label>
          <button type="button" className="mobile-primary-action" disabled={disabled || !title.trim()} onClick={saveNode}>保存环节信息</button>
          <div className="mobile-sheet-section">
            <h4>连接下一个环节</h4>
            {outgoing.length ? <ul>{outgoing.map((edge) => <li key={edge.id}><span>→ {config.graph.nodes.find((item) => item.id === edge.target)?.title ?? edge.target}</span><button type="button" disabled={disabled} onClick={() => run({ type: 'remove-edge', id: edge.id })}>移除</button></li>)}</ul> : <p>还没有后续连接。</p>}
            <label>选择连接目标<select value={nextId} onChange={(event) => setNextId(event.target.value)}>
              <option value="">请选择环节</option>
              {nodes.filter((item) => item.id !== node.id && !outgoing.some((edge) => edge.target === item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select></label>
            <button type="button" disabled={disabled || !nextId} onClick={addConnection}>添加连线</button>
          </div>
          <div className="mobile-sheet-section">
            <h4>关联 Markdown 文档</h4>
            {expected.length > 0 && <ul>{expected.map((item) => <li key={item.id}><span>{item.fileName}</span><small>{config.documentRules.bindings[item.id] ? '已绑定' : '待关联'}</small></li>)}</ul>}
            <label>已有文档<select value={docPath} onChange={(event) => setDocPath(event.target.value)}><option value="">请选择 Markdown</option>{paths.map((path) => <option value={path} key={path}>{path}</option>)}</select></label>
            <label>关联方式<select value={docRule} onChange={(event) => setDocRule(event.target.value)}>
              <option value="new">新建文档关联</option>{expected.map((item) => <option value={item.id} key={item.id}>替换：{item.fileName}</option>)}
            </select></label>
            <button type="button" disabled={disabled || !docPath} onClick={linkDocument}>关联文档</button>
          </div>
          <div className="mobile-sheet-section mobile-danger-section">
            {!confirmDelete ? <button type="button" disabled={disabled} onClick={() => setConfirmDelete(true)}>删除这个环节</button> :
              <div><p>这会删除环节及其连线和关联；系统会保留流程备份。</p><button type="button" onClick={() => setConfirmDelete(false)}>取消</button><button type="button" disabled={disabled} onClick={removeNode}>确认删除</button></div>}
          </div>
          {error && <p className="connection-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>}
  </section>;
}
