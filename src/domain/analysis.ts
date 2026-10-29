import type { ManualStatus } from './project';

export type EvidenceRef = { path: string; startLine: number; endLine: number };
export type AnalysisRecord = {
  nodeId: string; branch: string; commitSha: string; createdAt: string;
  model: string; adapter: 'openai-compatible' | 'ollama';
  decision: ManualStatus | 'insufficient'; summary: string; evidence: EvidenceRef[];
  inputs: { path: string; blobSha: string }[]; inputFingerprint: string;
  nextAction: string | null; adviceBasisFingerprint: string;
};
