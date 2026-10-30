import { z } from 'zod';
import type { ProjectConfig } from './project';

function safeRecord<T>(item: z.ZodType<T>) {
  return z.unknown().transform((input, context): Record<string, T> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      context.addIssue({ code: 'custom', message: '需要一个对象' });
      return z.NEVER;
    }
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(input)) {
      const parsed = item.safeParse(value);
      if (!parsed.success) { context.addIssue({ code: 'custom', path: [key], message: '对象内容无效' }); continue; }
      Object.defineProperty(result, key, { value: parsed.data, enumerable: true, writable: true, configurable: true });
    }
    return result;
  });
}

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
  bindings: safeRecord(z.string()),
});
const template = z.strictObject({
  id: z.string(), version: z.number().int(), title: z.string(), description: z.string(),
  graph, documentRules, prompts: safeRecord(z.string()),
});
const analysis = z.strictObject({
  nodeId: z.string(), branch: z.string(), commitSha: z.string(), createdAt: z.string(), model: z.string(),
  adapter: z.enum(['openai-compatible', 'ollama']), endpoint: z.string().optional(), scopeComplete: z.boolean().optional(), decision: z.union([manualStatus, z.literal('insufficient')]),
  summary: z.string(), evidence: z.array(z.strictObject({ path: z.string(), startLine: z.number().int(), endLine: z.number().int() })),
  inputs: z.array(z.strictObject({ path: z.string(), blobSha: z.string() })), inputFingerprint: z.string(),
  nextAction: z.string().nullable(), adviceBasisFingerprint: z.string(),
});
const branchState = z.strictObject({
  manualStatuses: safeRecord(manualStatus),
  documentChoices: safeRecord(documentChoice),
  analyses: safeRecord(analysis),
});
const branches = safeRecord(branchState);
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
