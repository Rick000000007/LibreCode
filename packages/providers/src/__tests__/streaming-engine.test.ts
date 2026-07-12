import { describe, it, expect, vi } from 'vitest';
import { StreamingEngine } from '../streaming-engine.js';

function createMockProvider(options?: { streamEvents?: any[], shouldFail?: boolean }) {
  return {
    name: () => 'test-provider',
    complete: vi.fn().mockImplementation(async () => {
      if (options?.shouldFail) throw new Error('Complete failed');
      return {
        content: 'Hello world',
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop' as const,
      };
    }),
    streamComplete: vi.fn().mockImplementation(async (request, onEvent, opts) => {
      if (options?.shouldFail) throw new Error('Stream failed');
      const events = options?.streamEvents ?? [
        { type: 'text_delta' as const, delta: 'Hello' },
        { type: 'text_delta' as const, delta: ' world' },
        { type: 'done' as const, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } },
      ];
      for (const event of events) {
        if (opts?.signal?.aborted) {
          throw new Error('Streaming aborted');
        }
        await onEvent(event);
      }
    }),
    maxContextWindow: () => 8192,
    supportsToolCalling: () => true,
    supportsStreaming: () => true,
    supportsVision: () => false,
    supportsReasoning: () => false,
    supportsThinking: () => false,
    supportsMCP: () => false,
    listModels: async () => [],
    getModel: () => ({ id: 'test', name: 'Test', provider: 'test', contextWindow: 8192, supportsToolCalling: true, supportsStreaming: true, isFree: true }),
    setModel: () => {},
  };
}

describe('StreamingEngine', () => {
  it('streams text deltas via streamComplete', async () => {
    const engine = new StreamingEngine();
    const provider = createMockProvider();
    const events: any[] = [];

    await engine.streamComplete(provider, 'test', {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: true,
    }, (event) => {
      events.push(event);
    });

    // Wait for stream to finish
    await new Promise((r) => setTimeout(r, 50));

    expect(events.length).toBeGreaterThan(0);
    const textEvents = events.filter((e) => e.type === 'text_delta');
    expect(textEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('completes non-streaming via complete API', async () => {
    const engine = new StreamingEngine();
    const provider = createMockProvider();
    // Force non-streaming by making supportsStreaming return false
    provider.supportsStreaming = () => false;

    const result = await engine.complete(provider, 'test', {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: false,
    });

    expect(result.content).toBe('Hello world');
    expect(result.usage.totalTokens).toBe(30);
  });

  it('sends provider_switch event when provider changes', async () => {
    const engine = new StreamingEngine();
    const provider = createMockProvider();
    engine.setActiveProvider('previous');
    const events: any[] = [];

    await engine.streamComplete(provider, 'new', {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: true,
    }, (event) => {
      events.push(event);
    });

    await new Promise((r) => setTimeout(r, 50));

    const switchEvents = events.filter((e) => e.type === 'provider_switch');
    expect(switchEvents.length).toBe(1);
    expect(switchEvents[0]!.from).toBe('previous');
    expect(switchEvents[0]!.to).toBe('new');
  });

  it('handles streaming errors gracefully', async () => {
    const engine = new StreamingEngine();
    const provider = createMockProvider({ shouldFail: true });
    const events: any[] = [];

    const controller = await engine.streamComplete(provider, 'test', {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: true,
    }, (event) => {
      events.push(event);
    });

    await engine.waitForCompletion(controller);

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBe(1);
  });

  it('cancelAll stops all streams', async () => {
    const engine = new StreamingEngine();
    const provider = createMockProvider();
    const events: any[] = [];

    const controller = await engine.streamComplete(provider, 'test', {
      model: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxTokens: 100,
      stream: true,
    }, (event) => {
      events.push(event);
    });

    engine.cancelAll();
    expect(controller.cancelled).toBe(true);
  });

  it('tracks active provider', () => {
    const engine = new StreamingEngine();
    expect(engine.activeProvider).toBeNull();
    engine.setActiveProvider('test');
    expect(engine.activeProvider).toBe('test');
  });
});
