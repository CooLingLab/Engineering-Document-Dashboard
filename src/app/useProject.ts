import { useEffect, useReducer, useRef } from 'react';
import { loadDocumentSnapshot } from '../documents/index';
import { createProject, getBranchState, type DocumentSnapshot, type ProjectConfig, type Repository } from '../domain/project';
import type { AnalysisRecord } from '../domain/analysis';
import { GitHubError, type GitHubReader } from '../github/client';
import { parseRepositoryInput } from '../github/repository';
import { templates } from '../templates/catalog';
import { initialSession, projectReducer, type ProjectAction } from './projectReducer';

function emptySnapshot(repository: Repository, root: string): DocumentSnapshot {
  return { repository, ref: null, root, documents: [], issues: [], fetchedAt: new Date().toISOString() };
}
function inaccessible(error: unknown): boolean {
  return error instanceof GitHubError && ['unauthorized', 'forbidden', 'not-found-or-no-access'].includes(error.kind);
}

export function useProject(reader: GitHubReader) {
  const [state, reactDispatch] = useReducer(projectReducer, initialSession);
  const current = useRef(state);
  const request = useRef<{ generation: number; controller: AbortController } | null>(null);
  const generation = useRef(0);
  function dispatch(action: ProjectAction) {
    current.current = projectReducer(current.current, action);
    reactDispatch(action);
  }
  function begin(repositoryId: number | null, branch: string | null) {
    request.current?.controller.abort();
    const next = { generation: ++generation.current, controller: new AbortController() };
    request.current = next;
    dispatch({ type: 'begin', generation: next.generation, repositoryId, branch });
    return next;
  }
  useEffect(() => () => { request.current?.controller.abort(); generation.current++; }, []);

  async function connect(input: string) {
    let parsed;
    try { parsed = parseRepositoryInput(input); }
    catch (error) { dispatch({ type: 'error', error: error instanceof Error ? error.message : '仓库地址无效。' }); return false; }
    const originalConfig = current.current.config;
    const pending = begin(null, null);
    let repositoryId: number | null = null;
    let branch: string | null = null;
    try {
      const repository = await reader.getRepository(parsed, pending.controller.signal);
      if (pending.generation !== generation.current) return false;
      repositoryId = repository.id;
      dispatch({ type: 'scope', generation: pending.generation, repositoryId, branch });
      let branches: string[];
      try { branches = await reader.listBranches(repository, pending.controller.signal); }
      catch (error) {
        if (error instanceof GitHubError && error.kind === 'empty-repository') branches = [];
        else throw error;
      }
      if (pending.generation !== generation.current) return false;
      const preserveDraft = Boolean(originalConfig && originalConfig.repository.id === repository.id);
      const metadataChanged = Boolean(preserveDraft && originalConfig && (originalConfig.repository.owner !== repository.owner || originalConfig.repository.name !== repository.name || originalConfig.repository.defaultBranch !== repository.defaultBranch));
      const priorBranch = preserveDraft ? current.current.selectedBranch : null;
      if (priorBranch && !branches.includes(priorBranch)) throw new GitHubError('not-found-or-no-access', '原分支不存在或无法读取，已保留当前草稿。');
      branch = priorBranch ?? (branches.length ? repository.defaultBranch || branches[0] : null);
      dispatch({ type: 'scope', generation: pending.generation, repositoryId, branch });
      const config = preserveDraft && originalConfig ? { ...originalConfig, repository } : createProject(repository, templates[0]);
      const snapshot = branch ? await loadDocumentSnapshot(reader, repository, branch, config.documentRules.root, pending.controller.signal)
        : emptySnapshot(repository, config.documentRules.root);
      if (pending.generation === generation.current && current.current.config !== originalConfig) {
        dispatch({ type: 'failed', generation: pending.generation, repositoryId, branch, error: '连接期间流程发生修改，已保留本地草稿；请保存后再切换。' });
        return false;
      }
      dispatch({ type: 'connected', generation: pending.generation, repositoryId, branch, config, snapshot, branches, preserveDraft, metadataChanged });
      return pending.generation === generation.current;
    } catch (error) {
      if (!pending.controller.signal.aborted) dispatch({ type: 'failed', generation: pending.generation, repositoryId, branch,
        error: error instanceof GitHubError ? error.message : '连接失败，请检查地址或网络后重试。' });
      return false;
    }
  }

  async function load(branch: string | null, config: ProjectConfig, replaceConfig = false, throwOnError = false) {
    const repositoryId = config.repository.id;
    const originalConfig = current.current.config;
    const pending = begin(repositoryId, branch);
    try {
      let snapshot = branch ? await loadDocumentSnapshot(reader, config.repository, branch, config.documentRules.root, pending.controller.signal)
        : emptySnapshot(config.repository, config.documentRules.root);
      const previous = current.current.snapshot;
      if (previous && previous.repository.id === repositoryId && previous.ref?.name === branch && previous.root === snapshot.root) {
        const documents = new Map(previous.documents.map((document) => [document.path, document]));
        snapshot = { ...snapshot, documents: snapshot.documents.map((document) => {
          const old = documents.get(document.path);
          return old && old.blobSha === document.blobSha && old.size === document.size && old.content === document.content ? old : document;
        }) };
      }
      if (replaceConfig && current.current.config !== originalConfig && pending.generation === generation.current) {
        dispatch({ type: 'failed', generation: pending.generation, repositoryId, branch, error: '读取期间流程已更改，请重新应用文档目录。' });
        return false;
      }
      dispatch({ type: 'loaded', generation: pending.generation, repositoryId, branch, snapshot, ...(replaceConfig ? { config } : {}) });
      return pending.generation === generation.current;
    } catch (error) {
      if (!pending.controller.signal.aborted) {
        const clearDocuments = inaccessible(error);
        if (clearDocuments && pending.generation === generation.current) reader.clearCache();
        dispatch({ type: 'failed', generation: pending.generation, repositoryId, branch, clearDocuments,
          error: error instanceof GitHubError ? error.message : '读取失败，请检查路径或网络后重试。' });
      }
      if (throwOnError) throw error;
      return false;
    }
  }
  async function selectBranch(branch: string) {
    if (current.current.config && branch) await load(branch, current.current.config);
  }
  async function refresh(throwOnError = false) {
    const config = current.current.config;
    if (!config) return;
    let branch = current.current.selectedBranch;
    const repositoryId = config.repository.id;
    const pending = begin(repositoryId, branch);
    try {
      const repository = await reader.getRepository(config.repository, pending.controller.signal);
      if (repository.id !== repositoryId) throw new GitHubError('not-found-or-no-access', '仓库身份发生变化，请重新连接。');
      let branches: string[];
      try { branches = await reader.listBranches(repository, pending.controller.signal); }
      catch (error) {
        if (error instanceof GitHubError && error.kind === 'empty-repository') branches = [];
        else throw error;
      }
      if (branch && !branches.includes(branch)) throw new GitHubError('not-found-or-no-access', '当前分支不存在或无法读取，已保留原有状态。');
      branch ??= branches.length ? repository.defaultBranch && branches.includes(repository.defaultBranch) ? repository.defaultBranch : branches[0] : null;
      dispatch({ type: 'scope', generation: pending.generation, repositoryId, branch });
      let snapshot = branch ? await loadDocumentSnapshot(reader, repository, branch, config.documentRules.root, pending.controller.signal)
        : emptySnapshot(repository, config.documentRules.root);
      const previous = current.current.snapshot;
      if (previous && previous.repository.id === repositoryId && previous.ref?.name === branch && previous.root === snapshot.root) {
        const oldDocuments = new Map(previous.documents.map((document) => [document.path, document]));
        snapshot = { ...snapshot, documents: snapshot.documents.map((document) => {
          const old = oldDocuments.get(document.path);
          return old && old.blobSha === document.blobSha && old.size === document.size && old.content === document.content ? old : document;
        }) };
      }
      dispatch({ type: 'loaded', generation: pending.generation, repositoryId, branch, snapshot, branches });
    } catch (error) {
      if (!pending.controller.signal.aborted) {
        const clearDocuments = inaccessible(error);
        if (clearDocuments && pending.generation === generation.current) reader.clearCache();
        dispatch({ type: 'failed', generation: pending.generation, repositoryId, branch, clearDocuments,
          error: error instanceof GitHubError ? error.message : '读取失败，请检查路径或网络后重试。' });
      }
      if (throwOnError) throw error;
    }
  }
  async function applyConfig(config: ProjectConfig) {
    if (current.current.config?.repository.id !== config.repository.id) return false;
    if (current.current.snapshot && current.current.snapshot.root !== config.documentRules.root) {
      return await load(current.current.selectedBranch, config, true);
    }
    dispatch({ type: 'config', config });
    return true;
  }
  async function applyLoadedConfig(config: ProjectConfig) {
    const repository = current.current.config?.repository;
    if (!repository || repository.id !== config.repository.id) return false;
    const sameIdentity = repository.owner === config.repository.owner && repository.name === config.repository.name && repository.defaultBranch === config.repository.defaultBranch;
    const normalized = sameIdentity ? config : { ...config, repository: structuredClone(repository) };
    const applied = await applyConfig(normalized);
    if (applied && sameIdentity) dispatch({ type: 'saved', config: normalized });
    return applied;
  }
  function commitAnalysis(repositoryId: number, record: AnalysisRecord) {
    const config = current.current.config;
    if (!config || config.repository.id !== repositoryId || !config.graph.nodes.some((node) => node.id === record.nodeId)) return;
    const next = structuredClone(config);
    const branch = structuredClone(getBranchState(next, record.branch));
    Object.defineProperty(branch.analyses, record.nodeId, { value: record, enumerable: true, writable: true, configurable: true });
    Object.defineProperty(next.branches, record.branch, { value: branch, enumerable: true, writable: true, configurable: true });
    dispatch({ type: 'config', config: next });
  }
  return { state, getState: () => current.current, connect, selectBranch, refresh, applyConfig, applyLoadedConfig,
    selectNode: (nodeId: string | null) => dispatch({ type: 'node', nodeId }),
    setError: (error: string | null) => dispatch({ type: 'error', error }),
    markSaved: (config: ProjectConfig) => dispatch({ type: 'saved', config }), commitAnalysis };
}
