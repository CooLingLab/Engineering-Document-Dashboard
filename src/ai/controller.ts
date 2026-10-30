import type { AnalysisRecord } from '../domain/analysis';
import type { DocumentSnapshot, ProjectConfig } from '../domain/project';
import { adviceBasisKey, analysisInputKey } from '../workflow/status';
import { endpointUrl, type ModelAdapter, type ModelSettings } from './adapters';
import { buildAnalysisInput, type AnalysisInput } from './input';
import { validateAnalysis } from './result';

export type AnalysisPreview = { repositoryId: number; settings: ModelSettings; inputs: AnalysisInput[]; titles: string[] };
type Session = { config: ProjectConfig; snapshot: DocumentSnapshot };
type Options = { getSession: () => Session | null; adapterFor: (settings: ModelSettings) => ModelAdapter;
  getModelKey: () => string | undefined; commit: (repositoryId: number, record: AnalysisRecord) => void;
  onProgress?: (completed: number, total: number) => void; timeoutMs?: number };

export class AnalysisController {
  #options: Options;
  #abort: AbortController | null = null;
  #running = false;
  #generation = 0;
  constructor(options: Options) { this.#options = options; }
  prepare(nodeIds: string[], settings: ModelSettings, excludedPaths: readonly string[] = []): AnalysisPreview {
    const session = this.#options.getSession();
    if (!session || !nodeIds.length) throw new Error('请先连接项目并选择环节。');
    endpointUrl(settings);
    const unique = [...new Set(nodeIds)];
    const inputs = unique.map((id) => buildAnalysisInput(session.config, session.snapshot, id, settings.maxInputChars, excludedPaths));
    return { repositoryId: session.config.repository.id, settings: { ...settings }, inputs,
      titles: unique.map((id) => session.config.graph.nodes.find((node) => node.id === id)!.title) };
  }
  async run(preview: AnalysisPreview): Promise<void> {
    if (this.#running) throw new Error('分析正在进行，请先等待或取消。');
    const session = this.#options.getSession();
    if (!session || session.config.repository.id !== preview.repositoryId || !session.snapshot.ref ||
      preview.inputs.some((input) => input.branch !== session.snapshot.ref?.name ||
        input.inputFingerprint !== analysisInputKey(session.config, session.snapshot, input.nodeId) ||
        input.adviceBasisFingerprint !== adviceBasisKey(session.config, input.branch))) throw new Error('项目、分支或分析依据已变化，请重新预览。');
    endpointUrl(preview.settings);
    const generation = ++this.#generation;
    const key = this.#options.getModelKey();
    this.#running = true;
    try {
      const results: AnalysisRecord[] = [];
      this.#options.onProgress?.(0, preview.inputs.length);
      for (let i = 0; i < preview.inputs.length; i++) {
        if (generation !== this.#generation) throw new DOMException('已取消分析', 'AbortError');
        const input = preview.inputs[i];
        let raw: unknown;
        if (!input.documents.some((document) => document.lines.some((line) => line.trim()))) {
          raw = { nodeId: input.nodeId, decision: 'insufficient', summary: '没有可分析的文档内容。', evidence: [], nextAction: null };
        } else {
          const abort = new AbortController();
          this.#abort = abort;
          let timedOut = false;
          const timer = setTimeout(() => { timedOut = true; abort.abort(); }, this.#options.timeoutMs ?? 90_000);
          let rejectAbort!: (reason: unknown) => void;
          const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
          const onAbort = () => rejectAbort(new DOMException('已取消分析', 'AbortError'));
          abort.signal.addEventListener('abort', onAbort, { once: true });
          try {
            raw = await Promise.race([this.#options.adapterFor(preview.settings).analyze(input, preview.settings, key, abort.signal), cancelled]);
          } catch (error) {
            if (timedOut) throw new Error('模型分析超过 90 秒，已停止等待；原有结果保持不变。');
            throw error;
          } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', onAbort); if (this.#abort === abort) this.#abort = null; }
        }
        if (generation !== this.#generation) throw new DOMException('已取消分析', 'AbortError');
        const record = validateAnalysis(raw, input, preview.settings, new Date());
        results.push(record);
        this.#options.onProgress?.(i + 1, preview.inputs.length);
      }
      if (generation !== this.#generation) throw new DOMException('已取消分析', 'AbortError');
      for (const record of results) this.#options.commit(preview.repositoryId, record);
    } finally { this.#running = false; this.#abort = null; }
  }
  cancel() { this.#generation++; this.#abort?.abort(); }
}
