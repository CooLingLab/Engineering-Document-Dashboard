import type { DocumentSnapshot, WorkflowGraph } from '../domain/project';
import type { DocumentStageLinks } from '../documents/tree';
import { githubFileUrl, MarkdownReader } from './MarkdownReader';

type Props = {
  snapshot: DocumentSnapshot;
  graph: WorkflowGraph;
  links: DocumentStageLinks;
  selectedStageId: string | null;
  selectedPath: string | null;
  onSelectDocument: (path: string) => void;
  onSelectStage: (id: string) => void;
};

export function DocumentPreview({ snapshot, graph, links, selectedStageId, selectedPath, onSelectDocument, onSelectStage }: Props) {
  const document = snapshot.documents.find((item) => item.path === selectedPath);
  const linkedStageIds = document ? links.byPath.get(document.path) ?? [] : [];
  const stages = linkedStageIds.map((id) => graph.nodes.find((node) => node.id === id)).filter((node) => node !== undefined);
  const relatedPaths = (selectedStageId ? links.byStage.get(selectedStageId) ?? [] : [])
    .filter((path) => snapshot.documents.some((item) => item.path === path));
  const currentStage = graph.nodes.find((node) => node.id === selectedStageId);
  const pathSegments = document?.path.split('/') ?? [];

  return <section className="document-preview-panel" aria-label="Markdown 文档阅读器">
    <div className="preview-heading">
      <div><span className="section-kicker">DOCUMENT READER</span><h3>文档阅读器</h3></div>
      {document && <a href={githubFileUrl(snapshot, document.path)} target="_blank" rel="noreferrer noopener"
        className="preview-github-link">在 GitHub 查看 ↗</a>}
    </div>

    {currentStage && <div className="preview-stage-documents">
      <div className="preview-subheading">当前阶段 · {currentStage.title}</div>
      {relatedPaths.length
        ? <div className="preview-document-tabs">
          {relatedPaths.map((path) => <button key={path} type="button"
            aria-pressed={selectedPath === path} title={path}
            onClick={() => onSelectDocument(path)}>{path.split('/').at(-1)}</button>)}
        </div>
        : <p className="preview-empty-hint">该阶段尚无确认关联的 Markdown 文档，可在下方阶段详情中检查缺失文件或关联已有文档。</p>}
    </div>}

    {document ? <>
      <div className="preview-file-info">
        <h4>{pathSegments.at(-1)}</h4>
        <div className="preview-breadcrumb" aria-label="文档路径">
          {pathSegments.map((part, index) => <span key={`${index}-${part}`}>{index > 0 && <span aria-hidden="true"> / </span>}{part}</span>)}
        </div>
        <div className="preview-associated-stages">
          <span>所属阶段：</span>
          {stages.length > 0
            ? stages.map((stage) => <button key={stage.id} type="button"
              onClick={() => onSelectStage(stage.id)}>{stage.title}</button>)
            : links.ambiguousPaths.has(document.path)
              ? <span className="preview-unlinked">关联候选存在歧义 · 待确认</span>
              : <span className="preview-unlinked">未关联 · 可在阶段详情中关联</span>}
        </div>
      </div>
      <div className="document-preview-content">
        <MarkdownReader content={document.content} documentPath={document.path} snapshot={snapshot} />
      </div>
    </> : <div className="document-preview-empty">
      <span aria-hidden="true">📄</span>
      <strong>请选择一份 Markdown 文档</strong>
      <p>可以点击开发阶段中的关联文件，或从文件目录中选择要阅读的文档。</p>
    </div>}
  </section>;
}
