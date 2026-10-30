import { endpointUrl, parseModelContent, postModel, systemPrompt, type ModelAdapter, type ModelSettings } from './adapters';
import type { AnalysisInput } from './input';

export class OllamaAdapter implements ModelAdapter {
  constructor(private fetcher: typeof fetch) {}
  async analyze(input: AnalysisInput, settings: ModelSettings, modelKey: string | undefined, signal?: AbortSignal): Promise<unknown> {
    if (settings.adapter !== 'ollama') throw new Error('模型适配器不匹配。');
    const endpoint = endpointUrl(settings);
    const response = await postModel(this.fetcher, endpoint, { model: settings.model, stream: false, format: 'json',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify(input) }] }, modelKey, signal);
    return parseModelContent((response as { message?: { content?: unknown } })?.message?.content);
  }
}
