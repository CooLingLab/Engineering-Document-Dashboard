import { Background, Controls, ReactFlow, applyNodeChanges, type NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NodeView, WorkflowGraph } from '../domain/project';
import type { DocumentIndex } from '../documents/match';
import { StageNode, type StageFlowNode } from './StageNode';

const nodeTypes = { stage: StageNode };
export type WorkflowCanvasProps = {
  graph: WorkflowGraph; nodeViews: Record<string, NodeView>; selectedNodeId: string | null;
  onSelectNode: (id: string) => void; onGraphChange?: (graph: WorkflowGraph) => void; documentIndex?: DocumentIndex;
};

export function WorkflowCanvas({ graph, nodeViews, selectedNodeId, onSelectNode, onGraphChange, documentIndex }: WorkflowCanvasProps) {
  const nodes: StageFlowNode[] = graph.nodes.map((node) => ({
    id: node.id, type: 'stage', position: node.position, selected: node.id === selectedNodeId,
    data: {
      title: node.title, order: node.order,
      view: nodeViews[node.id] ?? { status: 'unknown', source: 'none', analysis: 'absent' },
      missing: documentIndex?.matches.filter((match) => match.nodeId === node.id && match.kind === 'missing').length ?? 0,
    },
  }));

  function moveNodes(changes: NodeChange<StageFlowNode>[]) {
    if (!onGraphChange || !changes.some((change) => change.type === 'position' && change.position)) return;
    const next = applyNodeChanges(changes, nodes);
    onGraphChange({ ...graph, nodes: graph.nodes.map((node) => ({ ...node, position: next.find((item) => item.id === node.id)?.position ?? node.position })) });
  }

  return <div className="workflow-wrap">
    <nav className="stage-keyboard-nav" aria-label="选择开发环节">{graph.nodes.map((node) => <button type="button" key={node.id} onClick={() => onSelectNode(node.id)} aria-label={`查看${node.title}`}>{node.title}</button>)}</nav>
    <div className="flow-canvas" aria-label="开发流程图">
      <ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => onSelectNode(node.id)} onNodesChange={moveNodes} nodesDraggable={Boolean(onGraphChange)} nodesConnectable={false} deleteKeyCode={null} fitView minZoom={0.25} maxZoom={1.7}>
        <Background color="#d9dfed" gap={22} size={1} /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
  </div>;
}
