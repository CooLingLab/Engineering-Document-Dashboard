import { indexDocuments } from '../documents/match';
import { getBranchState, type DocumentChoice, type DocumentSnapshot, type ManualStatus, type ProjectConfig, type StageGuidance } from '../domain/project';
import { adviceBasisKey, analysisInputKey } from '../workflow/status';

export type AnalysisInput = {
  nodeId: string; branch: string; commitSha: string; inputFingerprint: string; adviceBasisFingerprint: string;
  guidance: StageGuidance; manualStatus: ManualStatus | null; documentChoices: Record<string, DocumentChoice>;
  documents: { path: string; blobSha: string; lines: string[] }[];
};
export class InputBudgetError extends Error {
  constructor(public required: number, public allowed: number) {
    super(`分析内容需要 ${required} 个字符，超过当前上限 ${allowed}；请缩小文档范围或调整上限。`);
    this.name = 'InputBudgetError';
  }
}
export function buildAnalysisInput(config: ProjectConfig, snapshot: DocumentSnapshot, nodeId: string, maxInputChars: number): AnalysisInput {
  const node = config.graph.nodes.find((item) => item.id === nodeId);
  if (!node || !snapshot.ref || snapshot.repository.id !== config.repository.id) throw new Error('当前环节或分支不可分析。');
  if (!Number.isSafeInteger(maxInputChars) || maxInputChars < 1) throw new Error('分析字符上限无效。');
  const state = getBranchState(config, snapshot.ref.name);
  const paths = new Set(indexDocuments(config, snapshot).matches.filter((match) => match.nodeId === nodeId && match.kind === 'found').flatMap((match) => match.paths));
  const choices: Record<string, DocumentChoice> = {};
  for (const item of config.documentRules.expected.filter((expected) => expected.nodeId === nodeId)) {
    if (Object.hasOwn(state.documentChoices, item.id)) Object.defineProperty(choices, item.id, { value: state.documentChoices[item.id], enumerable: true, configurable: true, writable: true });
  }
  const input: AnalysisInput = {
    nodeId, branch: snapshot.ref.name, commitSha: snapshot.ref.commitSha,
    inputFingerprint: analysisInputKey(config, snapshot, nodeId), adviceBasisFingerprint: adviceBasisKey(config, snapshot.ref.name),
    guidance: structuredClone(node.guidance), manualStatus: Object.hasOwn(state.manualStatuses, nodeId) ? state.manualStatuses[nodeId] : null,
    documentChoices: choices, documents: snapshot.documents.filter((document) => paths.has(document.path))
      .map((document) => ({ path: document.path, blobSha: document.blobSha, lines: document.content.split(/\r?\n/) })),
  };
  const required = JSON.stringify(input).length;
  if (required > maxInputChars) throw new InputBudgetError(required, maxInputChars);
  return input;
}
