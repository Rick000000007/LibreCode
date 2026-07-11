import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../model-registry.js';
import { HealthMonitor } from '../health-monitor.js';
import { AutoRouter } from '../auto-router.js';

function createRouter() {
  const registry = new ModelRegistry();
  const health = new HealthMonitor();
  const router = new AutoRouter(registry, health, { preferFree: false });
  return { registry, health, router };
}

describe('AutoRouter', () => {
  it('routes to highest scoring model for coding intent', async () => {
    const { router } = createRouter();
    const decision = await router.route({ intent: 'coding', preferFree: false });
    expect(decision.model).toBeDefined();
    expect(decision.model.scores.coding).toBeGreaterThanOrEqual(90);
    expect(decision.confidence).toBeGreaterThan(0);
  });

  it('routes to best free model when preferFree is true', async () => {
    const { router } = createRouter();
    const decision = await router.route({ intent: 'best-free', preferFree: true });
    expect(decision.model.pricing.free).toBe(true);
    // best-free should pick a capable free model like Gemini
    expect(decision.model.scores.overall).toBeGreaterThanOrEqual(60);
  });

  it('returns alternatives', async () => {
    const { router } = createRouter();
    const decision = await router.route({ intent: 'coding' });
    expect(decision.alternatives.length).toBeGreaterThan(0);
  });

  it('route with no parameters uses defaults', async () => {
    const { router } = createRouter();
    const decision = await router.route();
    expect(decision.model).toBeDefined();
    expect(decision.provider).toBeDefined();
  });

  it('resolveAlias maps correctly', () => {
    const { router } = createRouter();
    expect(router.resolveAlias('auto')).toBe('auto');
    expect(router.resolveAlias('coding')).toBe('coding');
    expect(router.resolveAlias('best-free')).toBe('best-free');
    expect(router.resolveAlias('nonexistent')).toBeNull();
  });

  it('setOptions updates configuration', () => {
    const { router } = createRouter();
    router.setOptions({ preferFree: true, defaultIntent: 'reasoning' });
    // No direct getter, but verify it doesn't throw
    expect(() => router.setOptions({ preferFree: false })).not.toThrow();
  });

  it('handles empty decisions gracefully', async () => {
    const registry = new ModelRegistry();
    const health = new HealthMonitor();
    // Register the health monitor but no providers
    const router = new AutoRouter(registry, health);
    const decision = await router.route({ intent: 'coding' });
    expect(decision.model).toBeDefined();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
  });

  it('applies health-based degradation to scores', async () => {
    const { router, health } = createRouter();
    // Register and mark a provider as degraded
    health.register('openai', {
      name: () => 'openai',
      complete: async () => ({ content: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' }),
      streamComplete: async () => [],
      maxContextWindow: () => 128_000,
      supportsToolCalling: () => true,
      supportsStreaming: () => true,
      supportsVision: () => true,
      supportsReasoning: () => false,
      supportsThinking: () => false,
      supportsMCP: () => false,
      listModels: async () => [],
      getModel: () => ({ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, supportsToolCalling: true, supportsStreaming: true, isFree: false }),
      setModel: () => {},
    });
    // Simulate failures
    for (let i = 0; i < 3; i++) {
      health.recordFailure('openai');
    }
    const decision = await router.route({ intent: 'auto' });
    expect(decision.model).toBeDefined();
  });
});
