import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleAdapter } from '../../src/ai/openaiCompatible';
import { OllamaAdapter } from '../../src/ai/ollama';
import { buildAnalysisInput } from '../../src/ai/input';
import { makeConfig, makeSnapshot } from '../fixtures';

const input = buildAnalysisInput(makeConfig(), makeSnapshot(), 'requirements', 12_000);
const result = { nodeId: 'requirements', decision: 'insufficient', summary: '信息不足', evidence: [], nextAction: null };

describe('model adapters', () => {
  it('sends only the explicit model key and selected input to an HTTPS chat-completions endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 }));
    const adapter = new OpenAICompatibleAdapter(fetcher);
    expect(await adapter.analyze(input, { adapter: 'openai-compatible', endpoint: 'https://model.example/v1/chat/completions', model: 'sample', maxInputChars: 12_000 }, 'synthetic-model-key')).toEqual(result);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://model.example/v1/chat/completions');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer synthetic-model-key');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('tools');
    expect(String(options.body)).not.toContain('synthetic-model-key');
  });
  it('sends Ollama requests only to an explicit loopback endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: { content: JSON.stringify(result) } }), { status: 200 }));
    const adapter = new OllamaAdapter(fetcher);
    const settings = { adapter: 'ollama' as const, endpoint: 'http://127.0.0.1:11434/api/chat', model: 'sample', maxInputChars: 12_000 };
    expect(await adapter.analyze(input, settings, undefined)).toEqual(result);
    await expect(adapter.analyze(input, { ...settings, endpoint: 'http://evil.example/api/chat' }, undefined)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects insecure online URLs and preserves an actionable error on failed requests', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429 }));
    const adapter = new OpenAICompatibleAdapter(fetcher);
    const settings = { adapter: 'openai-compatible' as const, endpoint: 'http://model.example/api', model: 'sample', maxInputChars: 12_000 };
    await expect(adapter.analyze(input, settings, undefined)).rejects.toThrow(/HTTPS/);
    await expect(adapter.analyze(input, { ...settings, endpoint: 'https://model.example/api' }, undefined)).rejects.toThrow(/429|限制/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not expose service response bodies or retry authorization errors', async () => {
    const fetcher = vi.fn(async () => new Response('synthetic-secret-in-response', { status: 401 }));
    const adapter = new OpenAICompatibleAdapter(fetcher);
    const settings = { adapter: 'openai-compatible' as const, endpoint: 'https://model.example/api', model: 'sample', maxInputChars: 12_000 };
    const error = await adapter.analyze(input, settings, 'synthetic-model-key').catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('synthetic-secret-in-response');
    expect(String(error)).not.toContain('synthetic-model-key');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves aborts and describes a network or browser cross-origin failure without guessing', async () => {
    const abort = new AbortController();
    abort.abort();
    const aborted = new OpenAICompatibleAdapter(vi.fn(async () => { throw new DOMException('aborted', 'AbortError'); }));
    const settings = { adapter: 'openai-compatible' as const, endpoint: 'https://model.example/api', model: 'sample', maxInputChars: 12_000 };
    await expect(aborted.analyze(input, settings, undefined, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const network = new OpenAICompatibleAdapter(vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(network.analyze(input, settings, undefined)).rejects.toThrow(/网络.*跨域/);
  });
});
