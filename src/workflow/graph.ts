import type { ProjectConfig, WorkflowGraph, WorkflowNode } from '../domain/project';
import { backupCurrent } from './backup';

export type GraphCommand =
  | { type: 'add-node'; node: WorkflowNode }
  | { type: 'rename-node'; id: string; title: string }
  | { type: 'move-node'; id: string; position: { x: number; y: number } }
  | { type: 'remove-node'; id: string }
  | { type: 'add-edge'; edge: WorkflowGraph['edges'][number] }
  | { type: 'remove-edge'; id: string }
  | { type: 'reorder-nodes'; ids: string[] }
  | { type: 'auto-layout' };

export function applyGraphCommand(config: ProjectConfig, command: GraphCommand): ProjectConfig {
  const next = command.type === 'remove-node' ? backupCurrent(config) : structuredClone(config);
  const findNode = (id: string) => {
    const node = next.graph.nodes.find((item) => item.id === id);
    if (!node) throw new Error('未找到这个开发环节。');
    return node;
  };

  switch (command.type) {
    case 'add-node': {
      const title = command.node.title.trim();
      if (!command.node.id || !title || next.graph.nodes.some((node) => node.id === command.node.id)) throw new Error('环节名称或标识无效。');
      next.graph.nodes.push({ ...structuredClone(command.node), title });
      break;
    }
    case 'rename-node': {
      const title = command.title.trim();
      if (!title) throw new Error('环节名称不能为空。');
      findNode(command.id).title = title;
      break;
    }
    case 'move-node': {
      if (!Number.isFinite(command.position.x) || !Number.isFinite(command.position.y)) throw new Error('环节位置无效。');
      findNode(command.id).position = { ...command.position };
      break;
    }
    case 'remove-node': {
      findNode(command.id);
      const documentIds = next.documentRules.expected.filter((item) => item.nodeId === command.id).map((item) => item.id);
      next.graph.nodes = next.graph.nodes.filter((node) => node.id !== command.id);
      next.graph.edges = next.graph.edges.filter((edge) => edge.source !== command.id && edge.target !== command.id);
      next.documentRules.expected = next.documentRules.expected.filter((item) => item.nodeId !== command.id);
      for (const id of documentIds) delete next.documentRules.bindings[id];
      for (const branch of Object.values(next.branches)) {
        delete branch.manualStatuses[command.id];
        delete branch.analyses[command.id];
        for (const id of documentIds) delete branch.documentChoices[id];
      }
      break;
    }
    case 'add-edge': {
      findNode(command.edge.source); findNode(command.edge.target);
      if (!command.edge.id || next.graph.edges.some((edge) => edge.id === command.edge.id ||
        (edge.source === command.edge.source && edge.target === command.edge.target))) throw new Error('连线已存在或标识无效。');
      next.graph.edges.push(structuredClone(command.edge));
      break;
    }
    case 'remove-edge':
      if (!next.graph.edges.some((edge) => edge.id === command.id)) throw new Error('未找到这条连线。');
      next.graph.edges = next.graph.edges.filter((edge) => edge.id !== command.id);
      break;
    case 'reorder-nodes': {
      const existing = new Set(next.graph.nodes.map((node) => node.id));
      if (command.ids.length !== existing.size || new Set(command.ids).size !== existing.size ||
        command.ids.some((id) => !existing.has(id))) throw new Error('环节顺序无效。');
      const order = new Map(command.ids.map((id, index) => [id, index]));
      next.graph.nodes = next.graph.nodes.map((node) => ({ ...node, order: order.get(node.id)!,
        position: { x: 40 + order.get(node.id)! * 220, y: 120 } }));
      break;
    }
    case 'auto-layout':
      next.graph.nodes = layoutGraphNodes(next.graph);
      break;
  }
  return next;
}

/** Layout by dependency layers. Cycles are placed in stable display order instead of looping. */
export function layoutGraphNodes(graph: WorkflowGraph): WorkflowNode[] {
  const ordered = [...graph.nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const known = new Set(ordered.map((node) => node.id));
  const degree = new Map(ordered.map((node) => [node.id, 0]));
  const outgoing = new Map(ordered.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!known.has(edge.source) || !known.has(edge.target) || edge.source === edge.target) continue;
    degree.set(edge.target, degree.get(edge.target)! + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const ranks = new Map(ordered.map((node) => [node.id, 0]));
  const queue = ordered.filter((node) => degree.get(node.id) === 0).map((node) => node.id);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const target of outgoing.get(id) ?? []) {
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(id)! + 1));
      degree.set(target, degree.get(target)! - 1);
      if (degree.get(target) === 0) queue.push(target);
    }
  }
  // Cycle nodes do not have a topological rank; preserve a predictable left-to-right order.
  let fallback = Math.max(0, ...[...visited].map((id) => ranks.get(id)!));
  for (const node of ordered) if (!visited.has(node.id)) ranks.set(node.id, ++fallback);
  const slotByRank = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of ordered) {
    const rank = ranks.get(node.id)!;
    const slot = slotByRank.get(rank) ?? 0;
    slotByRank.set(rank, slot + 1);
    positions.set(node.id, { x: 40 + rank * 240, y: 80 + slot * 170 });
  }
  return graph.nodes.map((node) => ({ ...node, position: positions.get(node.id)! }));
}
