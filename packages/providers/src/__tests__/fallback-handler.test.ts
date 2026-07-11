import { describe, it, expect, vi } from 'vitest';
import { HealthMonitor } from '../health-monitor.js';
import { ModelRegistry } from '../model-registry.js';
import { AutoRouter } from '../auto-router.js';
import { StreamingEngine } from '../streaming-engine.js';
import { ConversationStore } from '../conversation-store.js';
import { FallbackHandler } from '../fallback-handler.js';
import type { LLMProvider } from '../base.js';
import { LlmError } from '../base.js';

function createProvider(name: string, shouldSucceed = true, latencyMs = 10): LLMProvider {
  return {
    name: () => name,
    complete: vi.fn().mockImplementation(async () => {
      if (!shouldSucceed) throw new LlmError('rate_limited', `${name} rate limited`);
      await new Promise((r) => setTimeout(r, latencyMs));
      return {
        content: `Response from ${name}`,
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop' as const,
      };
    }),
    streamComplete: vi.fn().mockImplementation(async () => {
      if (!shouldSucceed) throw new LlmError('rate_limited', `${name} rate limited`);
      return [
        { type: 'text_delta' as const, delta: `Response from ${name}` },
        { type: 'done' as const, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } },
      ];
    }),
    maxContextWindow: () => 128_000,
    supportsToolCalling: () => true,
    supportsStreaming: () => true,
    supportsVision: () => false,
    supportsReasoning: () => false,
    supportsThinking: () => false,
    supportsMCP: () => false,
    listModels: async () => [],
    getModel: () => ({ id: `${name}-model`, name: `${name} Model`, provider: name, contextWindow: 128000, supportsToolCalling: true, supportsStreaming: true, isFree: false }),
    setModel: () => {},
  };
}

function createFallbackHandler() {
  const registry = new ModelRegistry();
  const health = new HealthMonitor();
  const router = new AutoRouter(registry, health, { preferFree: false });
  const streaming = new StreamingEngine();
  const conversation = new ConversationStore();
  const handler = new FallbackHandler(health, registry, router, streaming, conversation, {
    maxRetries: 2,
    maxProviderSwitches: 1,
    baseDelayMs: 10,
    maxDelayMs: 100,
  });
  return { registry, health, router, streaming, conversation, handler };
}

describe('FallbackHandler', () => {
  it('executes successfully on first try', async () => {
    const { handler, health } = createFallbackHandler();
    const provider = createProvider('primary', true);
    health.register('primary', provider);

    const events: any[] = [];
    await handler.executeWithFallback('primary', provider, {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: true,
    }, (event) => {
      events.push(event);
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('retries on transient errors via executeSimple', async () => {
    const { handler } = createFallbackHandler();
    let attempts = 0;
    const provider = {
      ...createProvider('test', true),
      complete: vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new LlmError('rate_limited', 'Rate limited');
        }
        return {
          content: 'Success after retries',
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: 'stop' as const,
        };
      }),
    };

    const result = await handler.executeSimple(provider, {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: false,
    });

    expect(attempts).toBe(3);
    expect(result.content).toBe('Success after retries');
  });

  it('executeSimple retries on failure', async () => {
    const { handler } = createFallbackHandler();
    let attempts = 0;
    const provider = {
      ...createProvider('test', true),
      complete: vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return {
          content: 'Success',
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: 'stop' as const,
        };
      }),
    };

    const result = await handler.executeSimple(provider, {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: false,
    });

    expect(attempts).toBe(2);
    expect(result.content).toBe('Success');
  });

  it('executeSimple fails after exhausting retries', async () => {
    const { handler } = createFallbackHandler();
    const provider = createProvider('failing', false);

    await expect(handler.executeSimple(provider, {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: false,
    })).rejects.toThrow();
  });
});
