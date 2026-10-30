import { z } from 'zod';
import type { AnalysisRecord } from '../domain/analysis';
import type { AnalysisInput } from './input';
import { endpointUrl, type ModelSettings } from './adapters';

const resultSchema = z.strictObject({
  nodeId: z.string().max(200), decision: z.enum(['not-started', 'in-progress', 'done', 'deferred', 'insufficient']),
  summary: z.string().min(1).max(2000),
  evidence: z.array(z.strictObject({ path: z.string().max(1000), startLine: z.number().int(), endLine: z.number().int() })).max(20),
  nextAction: z.string().max(500).nullable(),
});

function repeatsSource(text: string, input: AnalysisInput): boolean {
  const documents = input.documents.map((document) => document.lines.join('\n'));
  if (documents.some((document) => document.trim().length >= 8 && text.includes(document.trim()))) return true;
  const size = 32;
  if (text.length < size) return false;
  const chunks = new Set<string>();
  for (let i = 0; i <= text.length - size; i++) chunks.add(text.slice(i, i + size));
  for (const document of documents) {
    for (let i = 0; i <= document.length - size; i++) if (chunks.has(document.slice(i, i + size))) return true;
  }
  return false;
}

export function validateAnalysis(raw: unknown, input: AnalysisInput, settings: ModelSettings, now: Date): AnalysisRecord {
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success || parsed.data.nodeId !== input.nodeId) throw new Error('模型返回的分析格式或环节不正确。');
  const result = parsed.data;
  const documents = new Map(input.documents.map((document) => [document.path, document]));
  const substantive = (line: string) => { const text = line.trim(); return Boolean(text && !/^#{1,6}\s+\S/.test(text) && !/^[-*_]{3,}$/.test(text)); };
  const valid = result.evidence.every((evidence) => {
    const document = documents.get(evidence.path);
    return document && evidence.startLine >= 1 && evidence.endLine >= evidence.startLine && evidence.endLine <= document.lines.length &&
      document.lines.slice(evidence.startLine - 1, evidence.endLine).some(substantive);
  });
  const hasContent = input.documents.some((document) => document.lines.some(substantive));
  const downgrade = !valid || !hasContent || (result.decision !== 'insufficient' && result.evidence.length === 0);
  return {
    nodeId: input.nodeId, branch: input.branch, commitSha: input.commitSha, createdAt: now.toISOString(),
    model: settings.model, adapter: settings.adapter, endpoint: endpointUrl(settings), scopeComplete: input.scopeComplete,
    decision: downgrade ? 'insufficient' : result.decision,
    summary: downgrade ? '可核对的文档内容或证据不足，无法判断当前环节。' : repeatsSource(result.summary, input) ? '模型摘要包含较长原文摘录，已隐藏；请通过证据查看原文。' : result.summary,
    evidence: downgrade ? [] : result.evidence, nextAction: downgrade || (result.nextAction && repeatsSource(result.nextAction, input)) ? null : result.nextAction,
    inputs: input.documents.map(({ path, blobSha }) => ({ path, blobSha })),
    inputFingerprint: input.inputFingerprint, adviceBasisFingerprint: input.adviceBasisFingerprint,
  };
}
