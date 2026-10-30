import { getBranchState, type DocumentChoice, type DocumentSnapshot, type ManualStatus, type ProjectConfig } from '../domain/project';
import type { DocumentIndex } from '../documents/match';
import { useState } from 'react';
import { adviceBasisKey, analysisInputKey, deriveNodeView, setDocumentChoice, setManualStatus } from '../workflow/status';
import { githubFileUrl, MarkdownReader } from './MarkdownReader';
import { statusLabels } from './StageNode';

export type StageDetailsProps = { config: ProjectConfig; snapshot: DocumentSnapshot; nodeId: string; documentIndex: DocumentIndex; beginnerMode: boolean; aiEnabled?: boolean; onChangeConfig?: (config: ProjectConfig) => void };

export function StageDetails({ config, snapshot, nodeId, documentIndex, beginnerMode, aiEnabled = false, onChangeConfig }: StageDetailsProps) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const [copyMessage, setCopyMessage] = useState('');
  const node = config.graph.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const skippable = !['build', 'release'].includes(node.id);
  const matches = documentIndex.matches.filter((match) => match.nodeId === nodeId);
  const availablePaths = matches.filter((match) => match.kind === 'found').flatMap((match) => match.paths);
  const path = selectedPath && availablePaths.includes(selectedPath) ? selectedPath : availablePaths[0];
  const document = snapshot.documents.find((item) => item.path === path);
  const prompt = node.promptIds.map((id) => config.template?.prompts[id]).find(Boolean);
  const branch = snapshot.ref?.name;
  const state = getBranchState(config, branch ?? '');
  const view = deriveNodeView(config, snapshot, nodeId, aiEnabled);
  const analysis = Object.hasOwn(state.analyses, nodeId) ? state.analyses[nodeId] : undefined;
  const adviceCurrent = Boolean(branch && analysis?.adviceBasisFingerprint === adviceBasisKey(config, branch));
  const manual = Object.hasOwn(state.manualStatuses, nodeId) ? state.manualStatuses[nodeId] : '';
  const manualBasis = state.manualBases && Object.hasOwn(state.manualBases, nodeId) ? state.manualBases[nodeId] : undefined;

  async function copyPrompt() {
    if (!prompt) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(prompt);
      setCopyMessage('已复制');
    } catch { setCopyMessage('复制失败，请手动复制下面的 prompt。'); }
  }

  return (
    <section className="stage-details" role="region" aria-label={`${node.title}详情`}>
      <div className="detail-heading"><div><span className="section-kicker">STAGE DETAILS</span><h2>{node.title}</h2></div><span className="status-chip">{statusLabels[view.status]}{view.source === 'manual' ? ' · 手动' : view.source === 'ai' ? ' · 文档分析' : ''}</span></div>
      <label className="manual-status">手动状态<select aria-label="手动状态" value={manual} disabled={!branch || !onChangeConfig} onChange={(event) => { if (branch && onChangeConfig) onChangeConfig(setManualStatus(config, branch, nodeId, (event.target.value || null) as ManualStatus | null, snapshot)); }}><option value="">未标记</option><option value="not-started">未开始</option><option value="in-progress">进行中</option><option value="done">已完成</option><option value="deferred">暂缓</option>{skippable && <option value="skipped">跳过（本轮不适用）</option>}</select></label>
      {manual === 'skipped' && <p className="stage-skip-note">此阶段由你手动标记为不适用，仅对当前分支生效；不会被视为已完成或已验证。</p>}
      {manual && manualBasis && manualBasis !== analysisInputKey(config, snapshot, nodeId) && <p className="scan-issue">手动标记时的文档依据已变化；状态会保留，请自行检查。</p>}
      {aiEnabled && analysis && <div className="analysis-result"><strong>根据文档的分析 · {analysis.decision === 'insufficient' ? '信息不足' : statusLabels[analysis.decision]}</strong>
        <p>{analysis.summary}</p><small>{new Date(analysis.createdAt).toLocaleString()} · {analysis.model}{analysis.endpoint ? ` · ${analysis.endpoint}` : ''} · {view.analysis === 'stale' ? '文档依据已变化，结果已过期' : '基于当前文档'}{analysis.scopeComplete === false ? ' · 仅分析了部分文档，结果仅供参考' : ''}{!adviceCurrent ? ' · 建议依据已变化' : ''}</small>
        {analysis.evidence.length > 0 && <ul>{analysis.evidence.map((evidence, index) => {
          const repo = snapshot.repository;
          const path = evidence.path.split('/').map(encodeURIComponent).join('/');
          const link = `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/blob/${encodeURIComponent(analysis.commitSha)}/${path}#L${evidence.startLine}-L${evidence.endLine}`;
          return <li key={`${evidence.path}-${index}`}><a href={link} target="_blank" rel="noreferrer noopener">{evidence.path} · 第 {evidence.startLine}–{evidence.endLine} 行</a></li>;
        })}</ul>}
        {analysis.nextAction && view.analysis === 'fresh' && adviceCurrent && <p>建议：{analysis.nextAction}</p>}</div>}
      {beginnerMode && <div className="guidance-card"><strong>✦ 为什么要做这一步？</strong><p>{node.guidance.why}</p><p>{node.guidance.action}</p><ul>{node.guidance.checks.map((check) => <li key={check}>{check}</li>)}</ul></div>}
      <div className="detail-grid">
        <div className="document-panel"><div className="panel-heading"><h3>相关文档</h3><span>{matches.length} 项建议</span></div>
          {!matches.length && <p className="subtle">当前环节还没有关联文档。</p>}
          {matches.map((match) => <div className="document-item" key={match.documentId}>
            {match.kind === 'found' ? <button type="button" className="document-link" onClick={() => setSelectedPath(match.paths[0])}>{match.paths[0].split('/').at(-1)}</button> : <span>{config.documentRules.expected.find((item) => item.id === match.documentId)?.fileName}</span>}
            <small>{match.kind === 'missing' ? '建议补充' : match.kind === 'unavailable' ? '无法读取' : match.kind === 'ambiguous' ? '有多个候选' : match.contentCheck === 'heading-only' ? '只有标题' : match.contentCheck === 'empty' ? '空文档' : '已找到'}</small>
            <select aria-label={`文档取舍：${config.documentRules.expected.find((item) => item.id === match.documentId)?.fileName}`} value={Object.hasOwn(state.documentChoices, match.documentId) ? state.documentChoices[match.documentId] : 'needed'} disabled={!branch || !onChangeConfig} onChange={(event) => { if (branch && onChangeConfig) onChangeConfig(setDocumentChoice(config, branch, match.documentId, event.target.value as DocumentChoice)); }}><option value="needed">需要</option><option value="later">稍后再说</option><option value="not-needed">不需要</option></select>
          </div>)}
          {document && <div className="document-reading"><div className="reading-bar"><span>{document.path}</span>{githubFileUrl(snapshot, document.path) && <a href={githubFileUrl(snapshot, document.path)} target="_blank" rel="noreferrer noopener">在 GitHub 查看 ↗</a>}</div><MarkdownReader content={document.content} documentPath={document.path} snapshot={snapshot} /></div>}
        </div>
        <div className="prompt-panel"><div className="panel-heading"><h3>通用 prompt</h3><span>可在其他 AI 工具中使用</span></div>
          {prompt ? <><p className="prompt-copy">{prompt}</p><button type="button" className="secondary-button" onClick={copyPrompt}>复制 prompt</button>{copyMessage && <p className="copy-message" role="status">{copyMessage}</p>}</> : <p className="subtle">这个环节暂没有通用 prompt。</p>}
        </div>
      </div>
      {documentIndex.others.length > 0 && <div className="other-documents"><strong>其他文档</strong><p>这些文档尚未关联到当前路线：</p>{documentIndex.others.map((item) => <span key={item.path}>{item.path}</span>)}</div>}
    </section>
  );
}
