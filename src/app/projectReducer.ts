import type { DocumentSnapshot, ProjectConfig } from '../domain/project';

export type ProjectSession = {
  config: ProjectConfig | null; snapshot: DocumentSnapshot | null; selectedBranch: string | null;
  selectedNodeId: string | null; generation: number; busy: boolean; dirty: boolean; error: string | null;
  branches: string[]; requestRepositoryId: number | null; requestBranch: string | null;
};

export const initialSession: ProjectSession = {
  config: null, snapshot: null, selectedBranch: null, selectedNodeId: null, generation: 0,
  busy: false, dirty: false, error: null, branches: [], requestRepositoryId: null, requestBranch: null,
};

export type ProjectAction =
  | { type: 'begin'; generation: number; repositoryId: number | null; branch: string | null }
  | { type: 'scope'; generation: number; repositoryId: number; branch: string | null }
  | { type: 'connected'; generation: number; repositoryId: number; branch: string | null; config: ProjectConfig; snapshot: DocumentSnapshot; branches: string[]; preserveDraft: boolean; metadataChanged: boolean }
  | { type: 'loaded'; generation: number; repositoryId: number; branch: string | null; snapshot: DocumentSnapshot; config?: ProjectConfig; branches?: string[] }
  | { type: 'failed'; generation: number; repositoryId: number | null; branch: string | null; error: string; clearDocuments?: boolean; branches?: string[] }
  | { type: 'config'; config: ProjectConfig }
  | { type: 'node'; nodeId: string | null }
  | { type: 'error'; error: string | null }
  | { type: 'saved'; config: ProjectConfig };

export function projectReducer(state: ProjectSession, action: ProjectAction): ProjectSession {
  if (action.type === 'begin') return { ...state, generation: action.generation, requestRepositoryId: action.repositoryId, requestBranch: action.branch, busy: true, error: null };
  if (action.type === 'scope') return action.generation === state.generation
    ? { ...state, requestRepositoryId: action.repositoryId, requestBranch: action.branch } : state;
  if (action.type === 'config') return state.config?.repository.id === action.config.repository.id
    ? { ...state, config: action.config, dirty: true, selectedNodeId: action.config.graph.nodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : action.config.graph.nodes[0]?.id ?? null } : state;
  if (action.type === 'node') return { ...state, selectedNodeId: action.nodeId };
  if (action.type === 'error') return { ...state, error: action.error };
  if (action.type === 'saved') return state.config === action.config ? { ...state, dirty: false } : state;
  if (action.generation !== state.generation || action.repositoryId !== state.requestRepositoryId || action.branch !== state.requestBranch) return state;
  if (action.type === 'failed') return { ...state, busy: false, error: action.error, branches: action.branches ?? state.branches,
    snapshot: action.clearDocuments && state.snapshot && state.config?.repository.id === action.repositoryId
      ? { ...state.snapshot, documents: [], issues: [{ path: state.snapshot.root, kind: 'incomplete', message: '仓库或分支无法访问，已清除页面中的文档缓存。' }] }
      : state.snapshot };
  if (action.type === 'connected') return { ...state, config: action.config, snapshot: action.snapshot, branches: action.branches,
    selectedBranch: action.branch, selectedNodeId: action.preserveDraft && action.config.graph.nodes.some((node) => node.id === state.selectedNodeId)
      ? state.selectedNodeId : action.config.graph.nodes[0]?.id ?? null, busy: false, dirty: action.preserveDraft && (state.dirty || action.metadataChanged), error: null };
  if (state.config?.repository.id !== action.repositoryId) return state;
  return { ...state, config: action.config ?? state.config, snapshot: action.snapshot, selectedBranch: action.branch, branches: action.branches ?? state.branches,
    selectedNodeId: action.config && !action.config.graph.nodes.some((node) => node.id === state.selectedNodeId)
      ? action.config.graph.nodes[0]?.id ?? null : state.selectedNodeId,
    dirty: action.config ? true : state.dirty, busy: false, error: null };
}
