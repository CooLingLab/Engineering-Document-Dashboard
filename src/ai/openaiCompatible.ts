import { endpointUrl, modelInput, parseModelContent, postModel, systemPrompt, type ModelAdapter, type ModelSettings } from './adapters';
import type { AnalysisInput } from './input';

export class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(private fetcher: typeof fetch) {}
  async analyze(input: AnalysisInput, settings: ModelSettings, modelKey: string | undefined, signal?: AbortSignal): Promise<unknown> {
    if (settings.adapter !== 'openai-compatible') throw new Error('模型适配器不匹配。');
    const endpoint = endpointUrl(settings);
    const response = await postModel(this.fetcher, endpoint, { model: settings.model, stream: false,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify(modelInput(input)) }] }, modelKey, signal);
    const data = response as { choices?: { message?: { content?: unknown } }[] };
    return parseModelContent(data?.choices?.[0]?.message?.content);
  }
}
