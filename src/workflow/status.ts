import { getBranchState, type BranchState, type DocumentChoice, type DocumentSnapshot, type ManualStatus, type NodeView, type ProjectConfig } from '../domain/project';
import { indexDocuments } from '../documents/match';

export function analysisInputKey(config: ProjectConfig, snapshot: DocumentSnapshot, nodeId: string): string {
  const node = config.graph.nodes.find((item) => item.id === nodeId);
  const matches = indexDocuments(config, snapshot).matches.filter((item) => item.nodeId === nodeId)
    .map((item) => ({ id: item.documentId, kind: item.kind, paths: [...item.paths].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const paths = new Set(matches.flatMap((item) => item.paths));
  const documents = snapshot.documents.filter((item) => paths.has(item.path))
    .map((item) => ({ path: item.path, blobSha: item.blobSha })).sort((a, b) => a.path.localeCompare(b.path));
  const expected = config.documentRules.expected.filter((item) => item.nodeId === nodeId)
    .map((item) => ({ id: item.id, fileName: item.fileName })).sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ analysisRuleVersion: 1, node: node && { id: node.id, title: node.title, guidance: node.guidance },
    template: config.template && { id: config.template.id, version: config.template.version }, root: snapshot.root, expected, matches, documents });
}

export function adviceBasisKey(config: ProjectConfig, branch: string): string {
  const state = getBranchState(config, branch);
  const pairs = (value: Record<string, string>) => Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ statuses: pairs(state.manualStatuses), choices: pairs(state.documentChoices),
    nodes: config.graph.nodes.map(({ id, order }) => ({ id, order })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: config.graph.edges.map(({ source, target }) => ({ source, target })).sort((a, b) => `${a.source}/${a.target}`.localeCompare(`${b.source}/${b.target}`)) });
}

export function deriveNodeView(config: ProjectConfig, snapshot: DocumentSnapshot, nodeId: string, aiEnabled: boolean): NodeView {
  const branch = snapshot.ref?.name ?? '';
  const state = getBranchState(config, branch);
  const manual = Object.hasOwn(state.manualStatuses, nodeId) ? state.manualStatuses[nodeId] : undefined;
  const record = Object.hasOwn(state.analyses, nodeId) ? state.analyses[nodeId] : undefined;
  const fresh = Boolean(record && record.branch === branch && record.inputFingerprint === analysisInputKey(config, snapshot, nodeId));
  const analysis: NodeView['analysis'] = !aiEnabled ? 'disabled' : !record ? 'absent' : fresh ? 'fresh' : 'stale';
  if (manual) return { status: manual, source: 'manual', analysis };
  if (aiEnabled && fresh && record && record.decision !== 'insufficient') return { status: record.decision, source: 'ai', analysis };
  return { status: 'unknown', source: 'none', analysis };
}

function updateBranch(config: ProjectConfig, branch: string, update: (state: BranchState) => void): ProjectConfig {
  const next = structuredClone(config);
  const state = structuredClone(getBranchState(next, branch));
  update(state);
  Object.defineProperty(next.branches, branch, { value: state, writable: true, enumerable: true, configurable: true });
  return next;
}

export function setManualStatus(config: ProjectConfig, branch: string, nodeId: string, status: ManualStatus | null): ProjectConfig {
  if (!config.graph.nodes.some((node) => node.id === nodeId)) throw new Error('未找到这个开发环节。');
  return updateBranch(config, branch, (state) => {
    if (status === null) delete state.manualStatuses[nodeId];
    else Object.defineProperty(state.manualStatuses, nodeId, { value: status, writable: true, enumerable: true, configurable: true });
  });
}

export function setDocumentChoice(config: ProjectConfig, branch: string, documentId: string, choice: DocumentChoice): ProjectConfig {
  if (!config.documentRules.expected.some((document) => document.id === documentId)) throw new Error('未找到这份文档建议。');
  return updateBranch(config, branch, (state) => {
    Object.defineProperty(state.documentChoices, documentId, { value: choice, writable: true, enumerable: true, configurable: true });
  });
}
