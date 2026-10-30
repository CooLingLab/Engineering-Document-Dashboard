import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { NodeView } from '../domain/project';

export type StageNodeData = { title: string; order: number; view: NodeView; missing: number };
export type StageFlowNode = Node<StageNodeData, 'stage'>;
export const statusLabels: Record<NodeView['status'], string> = {
  unknown: '未判断', 'not-started': '未开始', 'in-progress': '进行中', done: '已完成', deferred: '暂缓',
};

export function StageNode({ data, selected }: NodeProps<StageFlowNode>) {
  return <div className={`stage-node${selected ? ' selected' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <div className="stage-node-top"><span>{String(data.order + 1).padStart(2, '0')}</span><span className="stage-node-dot" /></div>
    <strong>{data.title}</strong>
    <div className="stage-node-meta"><span>{statusLabels[data.view.status]}{data.view.source === 'ai' ? ' · 文档分析' : ''}</span>{data.missing > 0 && <span className="stage-missing">缺 {data.missing} 份</span>}</div>
    <Handle type="source" position={Position.Right} />
  </div>;
}
