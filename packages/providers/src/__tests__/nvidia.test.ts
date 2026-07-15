import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../provider-registry.js';
import { ProviderFactory } from '../provider-factory.js';
import { LlmError } from '../base.js';
import { OpenAICompatibleAdapter } from '../adapters/openai-compatible-adapter.js';
import { AdapterBridge } from '../adapter-bridge.js';
import { LibreError } from 'librecode-utils';

describe('NVIDIA provider', () => {
  const registry = new ProviderRegistry();
  const factory = new ProviderFactory(registry);

  test('creates provider instance', () => {
    const provider = factory.create('nvidia', {
      enabled: true,
      apiKey: 'nvapi-abcdef123456',
      defaultModel: 'meta/llama-3.1-8b-instruct',
    });
    expect(provider.name()).toBe('nvidia');
    expect(provider.supportsStreaming()).toBe(true);
    expect(provider.getModel?.().id).toBe('meta/llama-3.1-8b-instruct');
  });

  test('missing API key throws auth error', () => {
    expect(() => {
      factory.create('nvidia', { enabled: true });
    }).toThrow(LlmError);
  });

  test('default base URL matches NVIDIA docs', () => {
    const meta = registry.get('nvidia');
    expect(meta).toBeDefined();
    const baseUrl = registry.getBaseUrl('nvidia');
    // NVIDIA NIM API: URL https://integrate.api.nvidia.com, Endpoint POST /v1/chat/completions
    expect(baseUrl).toBe('https://integrate.api.nvidia.com/v1');
  });

  test('default model is valid', () => {
    const meta = registry.get('nvidia');
    expect(meta?.defaultModel).toBe('meta/llama-3.1-8b-instruct');
  });

  test('env key is NVIDIA_API_KEY', () => {
    const envKey = registry.getEnvKey('nvidia');
    expect(envKey).toBe('NVIDIA_API_KEY');
  });
});

describe('NVIDIA provider HTTP operations (mocked)', () => {
  let originalFetch: typeof globalThis.fetch;
  let provider: AdapterBridge;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();

    const adapter = new OpenAICompatibleAdapter({
      providerId: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: 'nvapi-test-key-12345',
      defaultModel: 'meta/llama-3.1-8b-instruct',
      authType: { type: 'bearer', envVar: 'NVIDIA_API_KEY' },
      capabilities: ['chat', 'streaming'],
    });
    provider = new AdapterBridge(adapter, 'meta/llama-3.1-8b-instruct', ['chat', 'streaming']);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('listModels()', () => {
    it('returns model list on success', async () => {
      const mockModels = {
        data: [
          { id: 'meta/llama-3.1-8b-instruct', object: 'model' },
          { id: 'mistralai/mistral-7b-instruct-v0.3', object: 'model' },
        ],
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockModels),
      });

      const models = await provider.listModels();
      expect(models.length).toBe(2);
      expect(models[0]!.id).toBe('meta/llama-3.1-8b-instruct');
      expect(models[1]!.id).toBe('mistralai/mistral-7b-instruct-v0.3');
      expect(models[0]!.provider).toBe('nvidia');
    });

    it('falls back to default model on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => 'Server Error',
      });

      const models = await provider.listModels();
      expect(models.length).toBe(1);
      expect(models[0]!.id).toBe('meta/llama-3.1-8b-instruct');
    });

    it('falls back to default model on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const models = await provider.listModels();
      expect(models.length).toBe(1);
    });
  });

  describe('chat (complete)', () => {
    it('returns completion on success', async () => {
      const mockResponse = {
        id: 'cmpl-123',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(mockResponse),
      });

      const result = await provider.complete({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        maxTokens: 1,
        stream: false,
      });

      expect(result.content).toBe('Hello!');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.totalTokens).toBe(15);

      // Verify request URL and body
      const fetchCall = (globalThis.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toContain('/chat/completions');
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.model).toBe('meta/llama-3.1-8b-instruct');
      expect(requestBody.stream).toBe(false);
    });

    it('throws error on 401 (auth)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: 'Invalid API key', code: 'invalid_api_key' } }),
      });

      await expect(provider.complete({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        stream: false,
      })).rejects.toThrow();
    });

    it('throws on 404 with model_not_found error type', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: 'Model not found', code: 'model_not_found', type: 'model_not_found' } }),
      });

      await expect(provider.complete({
        model: 'nonexistent-model',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        stream: false,
      })).rejects.toThrow();
    });

    it('throws on 404 without model_not_found', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: 'Not Found' } }),
      });

      await expect(provider.complete({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        stream: false,
      })).rejects.toThrow(/Endpoint not found/);
    });
  });

  describe('stream()', () => {
    it('processes streaming chunks and returns usage', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n',
        'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n',
        'data: [DONE]\n',
      ];
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: stream,
      });

      const events: any[] = [];
      await provider.streamComplete(
        {
          model: 'meta/llama-3.1-8b-instruct',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [],
          stream: true,
        },
        (event) => { events.push(event); },
      );

      expect(events.length).toBeGreaterThanOrEqual(3);
      const textDeltas = events.filter((e: any) => e.type === 'text_delta');
      expect(textDeltas.length).toBe(2);
      expect(textDeltas[0]!.delta).toBe('Hello');
      expect(textDeltas[1]!.delta).toBe(' world');

      const doneEvent = events.find((e: any) => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent.usage.totalTokens).toBe(8);
    });

    it('throws on streaming error response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
      });

      await expect(provider.streamComplete(
        {
          model: 'meta/llama-3.1-8b-instruct',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [],
          stream: true,
        },
        () => {},
      )).rejects.toThrow();
    });
  });
});
