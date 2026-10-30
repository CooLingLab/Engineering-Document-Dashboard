import type { NodeView, WorkflowGraph } from '../domain/project';
import { statusLabels } from '../workflow/statusLabels';

type Props = {
  graph: WorkflowGraph;
  nodeViews: Record<string, NodeView>;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
};

/** Touch-first navigation; never mutates the canonical workflow topology. */
export function FixedStageNavigator({ graph, nodeViews, selectedNodeId, onSelectNode }: Props) {
  return <nav className="fixed-stage-nav" aria-label="八阶段开发流程">
    {[...graph.nodes].sort((a, b) => a.order - b.order).map((node, index) => (
      <button key={node.id} type="button" className="fixed-stage-item"
        aria-current={node.id === selectedNodeId ? 'step' : undefined}
        onClick={() => onSelectNode(node.id)}>
        <span className="fixed-stage-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="fixed-stage-title">{node.title}</span>
        <span className="fixed-stage-status">{statusLabels[nodeViews[node.id]?.status ?? 'unknown']}</span>
      </button>
    ))}
  </nav>;
}
