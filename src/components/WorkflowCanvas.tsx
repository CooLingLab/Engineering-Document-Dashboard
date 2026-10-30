import { Background, Controls, ReactFlow, useNodesInitialized, useReactFlow, type NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useRef, useState } from 'react';
import type { DocumentChoice, NodeView, WorkflowGraph } from '../domain/project';
import type { DocumentIndex } from '../documents/match';
import { StageNode, type StageFlowNode } from './StageNode';

const nodeTypes = { stage: StageNode };
export type WorkflowCanvasProps = {
  graph: WorkflowGraph; nodeViews: Record<string, NodeView>; selectedNodeId: string | null;
  onSelectNode: (id: string) => void; onGraphChange?: (graph: WorkflowGraph) => void; documentIndex?: DocumentIndex; documentChoices?: Record<string, DocumentChoice>;
};

export function WorkflowCanvas({ graph, nodeViews, selectedNodeId, onSelectNode, onGraphChange, documentIndex, documentChoices = {} }: WorkflowCanvasProps) {
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const nodes: StageFlowNode[] = graph.nodes.map((node) => ({
    id: node.id, type: 'stage', position: dragPositions[node.id] ?? node.position, measured: dimensions[node.id], selected: node.id === selectedNodeId,
    data: {
      title: node.title, order: node.order,
      view: nodeViews[node.id] ?? { status: 'unknown', source: 'none', analysis: 'absent' },
      missing: documentIndex?.matches.filter((match) => match.nodeId === node.id && match.kind === 'missing' &&
        (!Object.hasOwn(documentChoices, match.documentId) || documentChoices[match.documentId] === 'needed')).length ?? 0,
    },
  }));

  function moveNodes(changes: NodeChange<StageFlowNode>[]) {
    if (changes.some((change) => change.type === 'dimensions' && change.dimensions)) {
      setDimensions((previous) => {
        let next = previous;
        for (const change of changes) {
          if (change.type !== 'dimensions' || !change.dimensions) continue;
          const current = previous[change.id];
          if (current?.width === change.dimensions.width && current.height === change.dimensions.height) continue;
          if (next === previous) next = { ...previous };
          next[change.id] = change.dimensions;
        }
        return next;
      });
    }
    if (!onGraphChange || !changes.some((change) => change.type === 'position' && change.position)) return;
    setDragPositions((previous) => {
      const next = { ...previous };
      for (const change of changes) if (change.type === 'position' && change.position) next[change.id] = change.position;
      return next;
    });
  }

  return <div className="workflow-wrap">
    <nav className="stage-keyboard-nav" aria-label="选择开发环节">{graph.nodes.map((node) => <button type="button" key={node.id} onClick={() => onSelectNode(node.id)} aria-label={`查看${node.title}`}>{node.title}</button>)}</nav>
    <div className="flow-canvas" aria-label="开发流程图">
      <ReactFlow<StageFlowNode> nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => onSelectNode(node.id)} onNodesChange={moveNodes} onNodeDragStop={(_, node) => {
        onGraphChange?.({ ...graph, nodes: graph.nodes.map((item) => item.id === node.id ? { ...item, position: node.position } : item) });
        setDragPositions((previous) => { const next = { ...previous }; delete next[node.id]; return next; });
      }} onConnect={(connection) => {
        if (!onGraphChange || !connection.source || !connection.target || graph.edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return;
        onGraphChange({ ...graph, edges: [...graph.edges, { id: `edge-${crypto.randomUUID()}`, source: connection.source, target: connection.target }] });
      }} nodesDraggable={Boolean(onGraphChange)} nodesConnectable={Boolean(onGraphChange)} deleteKeyCode={null} fitView minZoom={0.25} maxZoom={1.7}>
        <Background color="#d9dfed" gap={22} size={1} /><Controls showInteractive={false} /><FitOnTopologyChange nodeIds={graph.nodes.map((node) => node.id).join('|')} />
      </ReactFlow>
    </div>
  </div>;
}

function FitOnTopologyChange({ nodeIds }: { nodeIds: string }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const previous = useRef('');

  useEffect(() => {
    if (!nodeIds) { previous.current = ''; return; }
    if (!initialized || nodeIds === previous.current) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.15, duration: 150 }).then((fitted) => {
        if (fitted && !cancelled) previous.current = nodeIds;
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [fitView, initialized, nodeIds]);
  return null;
}
