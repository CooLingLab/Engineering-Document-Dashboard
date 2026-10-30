import type { ProjectConfig, TemplateSnapshot, WorkflowBackup } from '../domain/project';

export class BackupLimitError extends Error {
  constructor() { super('备用流程已满，请删除一份备用流程后再继续。'); this.name = 'BackupLimitError'; }
}

export function backupCurrent(config: ProjectConfig, now: Date = new Date()): ProjectConfig {
  if (config.backups.length >= 10) throw new BackupLimitError();
  const backup: WorkflowBackup = structuredClone({
    id: crypto.randomUUID(), createdAt: now.toISOString(), template: config.template,
    graph: config.graph, documentRules: config.documentRules, branches: config.branches,
  });
  return { ...structuredClone(config), backups: [...structuredClone(config.backups), backup] };
}

export function switchTemplate(config: ProjectConfig, template: TemplateSnapshot | null, now: Date): ProjectConfig {
  const next = backupCurrent(config, now);
  next.template = template ? structuredClone(template) : null;
  next.graph = template ? structuredClone(template.graph) : { nodes: [], edges: [] };
  next.documentRules = template ? structuredClone(template.documentRules) : { root: config.documentRules.root, expected: [], bindings: {} };
  next.documentRules.root = config.documentRules.root;
  next.branches = {};
  return next;
}

export function restoreBackup(config: ProjectConfig, backupId: string): ProjectConfig {
  const backup = config.backups.find((item) => item.id === backupId);
  if (!backup) throw new Error('未找到这份备用流程。');
  const next = backupCurrent(config);
  next.template = structuredClone(backup.template);
  next.graph = structuredClone(backup.graph);
  next.documentRules = structuredClone(backup.documentRules);
  next.branches = structuredClone(backup.branches);
  return next;
}
