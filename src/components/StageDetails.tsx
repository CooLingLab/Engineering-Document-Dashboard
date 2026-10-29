import type { DocumentSnapshot, ProjectConfig } from '../domain/project';
import type { DocumentIndex } from '../documents/match';
import { useState } from 'react';
import { githubFileUrl, MarkdownReader } from './MarkdownReader';

export type StageDetailsProps = { config: ProjectConfig; snapshot: DocumentSnapshot; nodeId: string; documentIndex: DocumentIndex; beginnerMode: boolean };

export function StageDetails({ config, snapshot, nodeId, documentIndex, beginnerMode }: StageDetailsProps) {
  const [selectedPath, setSelectedPath] = useState<string>();
  const [copyMessage, setCopyMessage] = useState('');
  const node = config.graph.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const matches = documentIndex.matches.filter((match) => match.nodeId === nodeId);
  const availablePaths = matches.filter((match) => match.kind === 'found').flatMap((match) => match.paths);
  const path = selectedPath && availablePaths.includes(selectedPath) ? selectedPath : availablePaths[0];
  const document = snapshot.documents.find((item) => item.path === path);
  const prompt = node.promptIds.map((id) => config.template?.prompts[id]).find(Boolean);

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
      <div className="detail-heading"><div><span className="section-kicker">STAGE DETAILS</span><h2>{node.title}</h2></div><span className="status-chip">未判断</span></div>
      {beginnerMode && <div className="guidance-card"><strong>✦ 为什么要做这一步？</strong><p>{node.guidance.why}</p><p>{node.guidance.action}</p><ul>{node.guidance.checks.map((check) => <li key={check}>{check}</li>)}</ul></div>}
      <div className="detail-grid">
        <div className="document-panel"><div className="panel-heading"><h3>相关文档</h3><span>{matches.length} 项建议</span></div>
          {!matches.length && <p className="subtle">当前环节还没有关联文档。</p>}
          {matches.map((match) => <div className="document-item" key={match.documentId}>
            {match.kind === 'found' ? <button type="button" className="document-link" onClick={() => setSelectedPath(match.paths[0])}>{match.paths[0].split('/').at(-1)}</button> : <span>{config.documentRules.expected.find((item) => item.id === match.documentId)?.fileName}</span>}
            <small>{match.kind === 'missing' ? '建议补充' : match.kind === 'unavailable' ? '无法读取' : match.kind === 'ambiguous' ? '有多个候选' : match.contentCheck === 'heading-only' ? '只有标题' : match.contentCheck === 'empty' ? '空文档' : '已找到'}</small>
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
