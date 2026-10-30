import { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisController, type AnalysisPreview } from '../ai/controller';
import type { ModelSettings } from '../ai/adapters';
import { OllamaAdapter } from '../ai/ollama';
import { OpenAICompatibleAdapter } from '../ai/openaiCompatible';
import type { AnalysisRecord } from '../domain/analysis';
import type { DocumentSnapshot, ProjectConfig } from '../domain/project';
import type { MemoryCredentials } from '../github/credentials';
import { indexDocuments } from '../documents/match';

type Mode = 'off' | ModelSettings['adapter'];
type Props = { config: ProjectConfig; snapshot: DocumentSnapshot; selectedNodeId: string | null; credentials: MemoryCredentials; fetcher: typeof fetch;
  onEnabledChange: (enabled: boolean) => void; onCommit: (repositoryId: number, record: AnalysisRecord) => void };

export function ModelPanel({ config, snapshot, selectedNodeId, credentials, fetcher, onEnabledChange, onCommit }: Props) {
  const [mode, setMode] = useState<Mode>('off');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [budget, setBudget] = useState(12_000);
  const [preview, setPreview] = useState<AnalysisPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [excludedPaths, setExcludedPaths] = useState<string[]>([]);
  const availablePaths = [...new Set(indexDocuments(config, snapshot).matches.filter((match) => match.kind === 'found').flatMap((match) => match.paths))];
  const latest = useRef({ config, snapshot, onCommit });
  latest.current = { config, snapshot, onCommit };
  const controller = useMemo(() => new AnalysisController({
    getSession: () => ({ config: latest.current.config, snapshot: latest.current.snapshot }),
    adapterFor: (settings) => settings.adapter === 'ollama' ? new OllamaAdapter(fetcher) : new OpenAICompatibleAdapter(fetcher),
    getModelKey: () => credentials.get('model'), commit: (id, record) => latest.current.onCommit(id, record),
    onProgress: (done, total) => setProgress(`已完成 ${done} / ${total} 个环节`),
  }), [credentials, fetcher]);
  useEffect(() => () => { controller.cancel(); credentials.set('model', undefined); }, [controller, credentials]);

  function changeMode(next: Mode) {
    controller.cancel(); setPreview(null); setMessage(''); setMode(next); credentials.set('model', undefined);
    setEndpoint(next === 'ollama' ? 'http://127.0.0.1:11434/api/chat' : '');
    onEnabledChange(next !== 'off');
  }
  function prepare(all: boolean) {
    if (mode === 'off') return;
    try {
      const ids = all ? [...config.graph.nodes].sort((a, b) => a.order - b.order).map((node) => node.id) : selectedNodeId ? [selectedNodeId] : [];
      setPreview(controller.prepare(ids, { adapter: mode, endpoint, model, maxInputChars: budget }, excludedPaths));
      setMessage('');
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : '无法准备分析。'); }
  }
  async function run() {
    if (!preview) return;
    setRunning(true); setMessage('');
    try { await controller.run(preview); setMessage('分析完成；结果已加入配置草稿，保存后可跨设备读取。'); }
    catch (error) { setMessage(error instanceof Error && error.name === 'AbortError' ? '分析已取消；已有结果保持不变。' : error instanceof Error ? error.message : '分析失败，已有结果保持不变。'); }
    finally { setRunning(false); setPreview(null); }
  }
  return <details className="directory-settings model-settings"><summary>文档分析设置 · {mode === 'off' ? '已关闭' : '按需分析'}</summary>
    <p>分析只根据已关联的文档，不会自动调用模型。在线分析会把所列文档正文发送到你填写的端点。</p>
    <label>分析方式<select aria-label="分析方式" value={mode} onChange={(event) => changeMode(event.target.value as Mode)}>
      <option value="off">关闭</option><option value="openai-compatible">在线模型（OpenAI 兼容）</option><option value="ollama">本地 Ollama</option>
    </select></label>
    {mode !== 'off' && <>
      <div className="model-inputs">
        <label>模型端点<input aria-label="模型端点" value={endpoint} placeholder={mode === 'ollama' ? 'http://127.0.0.1:11434/api/chat' : 'https://example.com/v1/chat/completions'} onChange={(event) => { setEndpoint(event.target.value); setPreview(null); }} /></label>
        <label>模型名称<input aria-label="模型名称" value={model} onChange={(event) => { setModel(event.target.value); setPreview(null); }} /></label>
        <label>模型密钥（可选）<input key={mode} aria-label="模型密钥" type="password" autoComplete="off" onChange={(event) => { credentials.set('model', event.target.value || undefined); setPreview(null); }} /></label>
        <label>输入字符上限<input aria-label="输入字符上限" type="number" min="1" value={budget} onChange={(event) => { setBudget(Number(event.target.value)); setPreview(null); }} /></label>
      </div>
      <small>字符上限是粗略限制，不等同于模型 token 数；密钥仅保存在当前页面。本地服务需允许浏览器跨域访问。</small>
      {availablePaths.length > 0 && <fieldset className="analysis-scope" disabled={running}><legend>选择要分析的文档</legend>
        <small>取消勾选可缩小发送范围；部分分析只作为参考，不自动决定环节状态。</small>
        {availablePaths.map((path) => <label key={path}><input type="checkbox" aria-label={`选择分析文档：${path}`} checked={!excludedPaths.includes(path)}
          onChange={(event) => { setExcludedPaths((paths) => event.target.checked ? paths.filter((item) => item !== path) : [...paths, path]); setPreview(null); }} />{path}</label>)}
      </fieldset>}
      <div className="project-controls model-actions"><button type="button" className="secondary-button" disabled={running || !selectedNodeId || !snapshot.ref} onClick={() => prepare(false)}>分析当前环节</button>
        <button type="button" className="secondary-button" disabled={running || !snapshot.ref || !config.graph.nodes.length} onClick={() => prepare(true)}>分析当前流程</button>
        {running && <button type="button" className="secondary-button" onClick={() => controller.cancel()}>取消分析</button>}{running && <span>{progress}</span>}</div>
      {preview && !running && <div className="analysis-preview" role="region" aria-label="分析范围预览">
        <strong>确认分析范围</strong><p>将向 {preview.settings.endpoint} 发送以下环节的关联文档正文：</p>
        {preview.inputs.map((input, index) => <div key={input.nodeId}><strong>{preview.titles[index]}</strong>{!input.scopeComplete && <p>部分文档未选，结果只作为参考。</p>}{input.documents.length
          ? <ul>{input.documents.map((document) => <li key={document.path}>{document.path}（{document.lines.length} 行）</li>)}</ul>
          : <p>没有关联文档；此环节将直接标记为信息不足，不发送模型请求。</p>}</div>)}
        <button type="button" className="secondary-button" onClick={() => void run()}>确认发送并分析</button>{' '}
        <button type="button" className="secondary-button" onClick={() => setPreview(null)}>取消</button>
      </div>}
    </>}
    {message && <p role="status">{message}</p>}
  </details>;
}
