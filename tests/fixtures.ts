import type { AnalysisRecord } from '../src/domain/analysis';
import { createProject, type DocumentSnapshot, type ProjectConfig } from '../src/domain/project';
import { templates } from '../src/templates/catalog';

export function makeSnapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    repository: { id: 123, owner: 'example', name: 'project', defaultBranch: 'main' },
    ref: { name: 'main', commitSha: 'commit-1' },
    root: 'docs/development', documents: [], issues: [], fetchedAt: '2026-10-30T00:00:00.000Z',
    ...overrides,
  };
}

export function makeConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return { ...createProject(makeSnapshot().repository, templates[0]), ...overrides };
}

export function makeAnalysis(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    nodeId: 'requirements', branch: 'main', commitSha: 'commit-1', createdAt: '2026-10-30T00:00:00.000Z',
    model: 'example', adapter: 'openai-compatible', decision: 'in-progress', summary: '需求还在整理。',
    evidence: [{ path: 'docs/development/02-requirements.md', startLine: 1, endLine: 1 }],
    inputs: [{ path: 'docs/development/02-requirements.md', blobSha: 'blob-1' }],
    inputFingerprint: 'example-input', nextAction: null, adviceBasisFingerprint: 'example-basis',
    ...overrides,
  };
}
