import { z } from 'zod';
import type { ProjectConfig } from './project';

const manualStatus = z.enum(['not-started', 'in-progress', 'done', 'deferred']);
const documentChoice = z.enum(['needed', 'not-needed', 'later']);
const repository = z.strictObject({
  id: z.number().int().positive(), owner: z.string(), name: z.string(),
  defaultBranch: z.string().nullable(),
});
const guidance = z.strictObject({ why: z.string(), action: z.string(), checks: z.array(z.string()) });
const graph = z.strictObject({
  nodes: z.array(z.strictObject({
    id: z.string(), title: z.string(), order: z.number(),
    position: z.strictObject({ x: z.number(), y: z.number() }),
    guidance, promptIds: z.array(z.string()),
  })),
  edges: z.array(z.strictObject({ id: z.string(), source: z.string(), target: z.string() })),
});
const documentRules = z.strictObject({
  root: z.string(),
  expected: z.array(z.strictObject({ id: z.string(), nodeId: z.string(), fileName: z.string() })),
  bindings: z.record(z.string(), z.string()),
});
const template = z.strictObject({
  id: z.string(), version: z.number().int(), title: z.string(), description: z.string(),
  graph, documentRules, prompts: z.record(z.string(), z.string()),
});
const analysis = z.strictObject({
  nodeId: z.string(), branch: z.string(), commitSha: z.string(), createdAt: z.string(), model: z.string(),
  adapter: z.enum(['openai-compatible', 'ollama']), decision: z.union([manualStatus, z.literal('insufficient')]),
  summary: z.string(), evidence: z.array(z.strictObject({ path: z.string(), startLine: z.number().int(), endLine: z.number().int() })),
  inputs: z.array(z.strictObject({ path: z.string(), blobSha: z.string() })), inputFingerprint: z.string(),
  nextAction: z.string().nullable(), adviceBasisFingerprint: z.string(),
});
const branchState = z.strictObject({
  manualStatuses: z.record(z.string(), manualStatus),
  documentChoices: z.record(z.string(), documentChoice),
  analyses: z.record(z.string(), analysis),
});
const branches = z.record(z.string(), branchState);
const backup = z.strictObject({
  id: z.string(), createdAt: z.string(), template: template.nullable(), graph, documentRules, branches,
});
const projectConfig = z.strictObject({
  schemaVersion: z.literal(1), repository, template: template.nullable(), graph, documentRules,
  branches, backups: z.array(backup),
});

export function parseProjectConfig(input: unknown):
  | { kind: 'supported'; config: ProjectConfig }
  | { kind: 'unsupported-version'; version: number } {
  if (typeof input === 'object' && input !== null && 'schemaVersion' in input) {
    const version = input.schemaVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version !== 1) {
      return { kind: 'unsupported-version', version };
    }
  }
  const result = projectConfig.safeParse(input);
  if (!result.success) throw new Error('项目配置格式无效，请检查配置文件。');
  return { kind: 'supported', config: result.data };
}
