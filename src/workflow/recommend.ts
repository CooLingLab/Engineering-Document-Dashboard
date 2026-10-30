import { getBranchState, type DocumentSnapshot, type ProjectConfig, type Recommendation } from '../domain/project';
import type { DocumentIndex } from '../documents/match';
import { deriveNodeView } from './status';

export function recommendNext(config: ProjectConfig, snapshot: DocumentSnapshot, index: DocumentIndex, aiEnabled: boolean): Recommendation {
  const nodes = [...config.graph.nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (!nodes.length) return { nodeId: null, action: 'add-stage', source: 'template', reason: '先添加一个开发环节，或选择一条路线。' };
  const branch = snapshot.ref?.name ?? '';
  const state = getBranchState(config, branch);
  const views = new Map(nodes.map((node) => [node.id, deriveNodeView(config, snapshot, node.id, aiEnabled)]));
  const pending = nodes.filter((node) => !['done', 'deferred'].includes(views.get(node.id)!.status));
  if (!pending.length) return { nodeId: null, action: 'all-done', source: 'manual', reason: '当前没有建议推进的环节。' };
  const progressing = pending.find((node) => views.get(node.id)?.source === 'manual' && views.get(node.id)?.status === 'in-progress');
  const ready = pending.find((node) => config.graph.edges.filter((edge) => edge.target === node.id).every((edge) => {
    const previous = views.get(edge.source)?.status;
    return previous !== 'not-started' && previous !== 'in-progress';
  }));
  const node = progressing ?? ready ?? pending[0];
  const missing = index.matches.find((item) => item.nodeId === node.id && item.kind === 'missing' &&
    (!Object.hasOwn(state.documentChoices, item.documentId) || state.documentChoices[item.documentId] === 'needed'));
  const source = progressing ? 'manual' : 'template';
  return missing
    ? { nodeId: node.id, documentId: missing.documentId, action: 'create-document', source, reason: `建议为“${node.title}”补充相关文档。` }
    : { nodeId: node.id, action: 'review-stage', source, reason: `查看“${node.title}”的说明和检查要点，决定如何继续。` };
}
