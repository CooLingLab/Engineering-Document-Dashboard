import type { ProjectConfig } from '../domain/project';
import type { DocumentIndex } from '../documents/match';
import { useEffect, useState } from 'react';
import { applyGraphCommand, type GraphCommand } from '../workflow/graph';

export type WorkflowEditorProps = {
  config: ProjectConfig; selectedNodeId: string | null; documentIndex: DocumentIndex;
  onChange: (config: ProjectConfig) => void; onSelectNode: (id: string | null) => void;
  onUndo: () => void; canUndo: boolean;
};
export function WorkflowEditor({ config, selectedNodeId, documentIndex, onChange, onSelectNode, onUndo, canUndo }: WorkflowEditorProps) {
  const node = config.graph.nodes.find((item) => item.id === selectedNodeId);
  const [newTitle, setNewTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rename, setRename] = useState(node?.title ?? '');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [documentPath, setDocumentPath] = useState('');
  const [documentTarget, setDocumentTarget] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const expected = config.documentRules.expected.filter((item) => item.nodeId === selectedNodeId);
  const documentPaths = [...new Set([
    ...documentIndex.others.map((document) => document.path),
    ...documentIndex.matches.filter((match) => match.kind === 'found' || match.kind === 'ambiguous').flatMap((match) => match.paths),
  ])].sort();

  useEffect(() => { setRename(node?.title ?? ''); setConfirmDelete(false); setDocumentTarget(''); }, [node?.id, node?.title]);

  function run(command: GraphCommand): ProjectConfig | undefined {
    try { const next = applyGraphCommand(config, command); setError(''); onChange(next); return next; }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法修改流程。'); return undefined; }
  }

  function addNode() {
    const title = newTitle.trim();
    if (!title) { setError('请先填写新环节名称。'); return; }
    const id = `stage-${crypto.randomUUID()}`;
    const next = run({ type: 'add-node', node: {
      id, title, order: Math.max(-1, ...config.graph.nodes.map((item) => item.order)) + 1,
      position: { x: Math.max(-160, ...config.graph.nodes.map((item) => item.position.x)) + 200, y: 120 },
      guidance: { why: description.trim() || '记录这个环节的目的。', action: '查看或关联这个环节的文档。', checks: [] }, promptIds: [],
    } });
    if (next) { setNewTitle(''); setDescription(''); onSelectNode(id); }
  }

  function addEdge() {
    if (!source || !target) { setError('请选择连线的起点和终点。'); return; }
    run({ type: 'add-edge', edge: { id: `edge-${crypto.randomUUID()}`, source, target } });
  }

  function associateDocument() {
    if (!node || !documentPath || !documentPaths.includes(documentPath)) {
      setError('请选择可读取的文档。'); return;
    }
    const next = structuredClone(config);
    let id = documentTarget;
    if (id === 'new') {
      id = `${node.id}-doc-${crypto.randomUUID()}`;
      next.documentRules.expected.push({ id, nodeId: node.id, fileName: documentPath.split('/').at(-1)! });
    } else if (!expected.some((document) => document.id === id)) {
      setError('请选择需要关联的文档建议。'); return;
    }
    next.documentRules.bindings[id] = documentPath;
    setError(''); setDocumentPath(''); onChange(next);
  }

  function renameDocument(documentId: string, value: string) {
    const fileName = value.trim();
    if (!fileName.toLowerCase().endsWith('.md') || fileName.startsWith('/') || fileName.split('/').some((part) => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) {
      setError('请填写文档目录内的相对 Markdown 文件名。'); return;
    }
    const next = structuredClone(config);
    const document = next.documentRules.expected.find((item) => item.id === documentId);
    if (document) document.fileName = fileName;
    setError(''); onChange(next);
  }

  return <section className="editor-panel" aria-label="编辑流程">
    <div className="editor-heading"><div><span className="section-kicker">MAKE IT YOURS</span><h3>编辑你的开发路线</h3></div><button type="button" className="secondary-button" disabled={!canUndo} onClick={onUndo}>撤销上一步</button></div>
    <div className="editor-grid">
      <div className="editor-group"><h4>添加环节</h4><label>新环节名称<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="例如：用户访谈" /></label><label>环节说明<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这一步为什么重要？" /></label><button type="button" className="secondary-button" onClick={addNode}>添加环节</button></div>
      <div className="editor-group"><h4>连接环节</h4><label>起点<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">请选择</option>{config.graph.nodes.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>终点<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">请选择</option>{config.graph.nodes.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><button type="button" className="secondary-button" onClick={addEdge}>添加连线</button><div className="edge-list">{config.graph.edges.map((edge) => <div key={edge.id}><span>{config.graph.nodes.find((item) => item.id === edge.source)?.title} → {config.graph.nodes.find((item) => item.id === edge.target)?.title}</span><button type="button" onClick={() => run({ type: 'remove-edge', id: edge.id })}>删除连线</button></div>)}</div></div>
      <div className="editor-group"><h4>当前环节</h4>{node ? <><label>环节名称<input value={rename} onChange={(event) => setRename(event.target.value)} /></label><div className="editor-actions"><button type="button" className="secondary-button" onClick={() => run({ type: 'rename-node', id: node.id, title: rename })}>保存名称</button><button type="button" className="text-danger" onClick={() => setConfirmDelete(true)}>删除当前环节</button></div>{confirmDelete && <div className="confirm-delete"><p>删除会移除关联和连线，并保留一份备用流程。</p><button type="button" className="text-danger" onClick={() => { const next = run({ type: 'remove-node', id: node.id }); if (next) onSelectNode(next.graph.nodes[0]?.id ?? null); setConfirmDelete(false); }}>确认删除</button><button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>取消</button></div>}{expected.map((document) => <DocumentNameEditor key={document.id} id={document.id} name={document.fileName} onSave={renameDocument} />)}</> : <p className="subtle">先在流程图中选择一个环节。</p>}</div>
    </div>
    {node && <div className="association-row"><h4>关联已有文档</h4><label>选择文档<select value={documentPath} onChange={(event) => setDocumentPath(event.target.value)}><option value="">请选择文档</option>{documentPaths.map((path) => <option key={path} value={path}>{path}</option>)}</select></label><label>关联到<select value={documentTarget} onChange={(event) => setDocumentTarget(event.target.value)}><option value="">请选择</option>{expected.map((document) => <option key={document.id} value={document.id}>{document.fileName}</option>)}<option value="new">作为新关联文档</option></select></label><button type="button" className="secondary-button" onClick={associateDocument}>关联文档</button></div>}
    {error && <p className="connection-error" role="alert">{error}</p>}
  </section>;
}

function DocumentNameEditor({ id, name, onSave }: { id: string; name: string; onSave: (id: string, value: string) => void }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return <div className="document-name-editor"><label>建议文件名<input value={value} onChange={(event) => setValue(event.target.value)} /></label><button type="button" className="secondary-button" onClick={() => onSave(id, value)}>修改命名</button></div>;
}
