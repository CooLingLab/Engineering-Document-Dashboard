import type { AnalysisRecord } from './analysis';

export type ManualStatus = 'not-started' | 'in-progress' | 'done' | 'deferred' | 'skipped';
export type DocumentChoice = 'needed' | 'not-needed' | 'later';
export type Repository = { id: number; owner: string; name: string; defaultBranch: string | null };
export type BranchRef = { name: string; commitSha: string };
export type DocumentFile = { path: string; blobSha: string; content: string; size: number };
export type ExpectedDocument = { id: string; nodeId: string; fileName: string };
export type StageGuidance = { why: string; action: string; checks: string[] };
export type WorkflowNode = {
  id: string; title: string; order: number; position: { x: number; y: number };
  guidance: StageGuidance; promptIds: string[];
};
export type WorkflowGraph = { nodes: WorkflowNode[]; edges: { id: string; source: string; target: string }[] };
export type DocumentRules = { root: string; expected: ExpectedDocument[]; bindings: Record<string, string> };
export type TemplateSnapshot = {
  id: string; version: number; title: string; description: string;
  graph: WorkflowGraph; documentRules: DocumentRules; prompts: Record<string, string>;
};
export type BranchState = {
  manualStatuses: Record<string, ManualStatus>;
  manualBases?: Record<string, string>;
  documentChoices: Record<string, DocumentChoice>;
  analyses: Record<string, AnalysisRecord>;
};
export type WorkflowBackup = {
  id: string; createdAt: string; template: TemplateSnapshot | null;
  graph: WorkflowGraph; documentRules: DocumentRules; branches: Record<string, BranchState>;
};
export type ProjectConfig = {
  schemaVersion: 1; repository: Repository; template: TemplateSnapshot | null;
  graph: WorkflowGraph; documentRules: DocumentRules;
  branches: Record<string, BranchState>; backups: WorkflowBackup[];
};
export type ReadIssue = { path: string; kind: 'missing' | 'too-large' | 'incomplete'; message: string };
export type DocumentSnapshot = {
  repository: Repository; ref: BranchRef | null; root: string;
  documents: DocumentFile[]; issues: ReadIssue[]; fetchedAt: string;
};
export type NodeView = {
  status: ManualStatus | 'unknown'; source: 'manual' | 'ai' | 'none';
  analysis: 'fresh' | 'stale' | 'absent' | 'disabled';
};
export type Recommendation = {
  nodeId: string | null; documentId?: string;
  action: 'create-document' | 'review-stage' | 'add-stage' | 'all-done';
  source: 'manual' | 'template' | 'ai'; reason: string;
};

export function createProject(repository: Repository, template: TemplateSnapshot | null): ProjectConfig {
  return {
    schemaVersion: 1,
    repository: structuredClone(repository),
    template: template ? structuredClone(template) : null,
    graph: template ? structuredClone(template.graph) : { nodes: [], edges: [] },
    documentRules: template
      ? structuredClone(template.documentRules)
      : { root: 'docs/development', expected: [], bindings: {} },
    branches: {},
    backups: [],
  };
}

export function getBranchState(config: ProjectConfig, branch: string): BranchState {
  return Object.hasOwn(config.branches, branch)
    ? config.branches[branch]
    : { manualStatuses: {}, documentChoices: {}, analyses: {} };
}
