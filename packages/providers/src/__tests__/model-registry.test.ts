import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../model-registry.js';

describe('ModelRegistry', () => {
  it('loads known models on construction', () => {
    const registry = new ModelRegistry();
    expect(registry.size()).toBeGreaterThan(15);
  });

  it('getAll returns all models', () => {
    const registry = new ModelRegistry();
    const all = registry.getAll();
    expect(all.length).toBe(registry.size());
    for (const r of all) {
      expect(r.modelId).toBeTruthy();
      expect(r.providerId).toBeTruthy();
      expect(r.source).toBe('curated');
    }
  });

  it('getByProvider filters correctly', () => {
    const registry = new ModelRegistry();
    const openai = registry.getByProvider('openai');
    expect(openai.length).toBeGreaterThan(0);
    for (const r of openai) {
      expect(r.providerId).toBe('openai');
    }
  });

  it('getModel finds by id and provider', () => {
    const registry = new ModelRegistry();
    const m = registry.getModel('gpt-4o', 'openai');
    expect(m).toBeDefined();
    expect(m!.modelId).toBe('gpt-4o');
    expect(m!.providerId).toBe('openai');
  });

  it('getModel finds by id without provider', () => {
    const registry = new ModelRegistry();
    const m = registry.getModel('gpt-4o');
    expect(m).toBeDefined();
    expect(m!.modelId).toBe('gpt-4o');
  });

  it('findBest returns highest scoring model for intent', () => {
    const registry = new ModelRegistry();
    const coding = registry.findBest('coding');
    expect(coding).toBeDefined();
    expect(coding!.metadata.scores.coding).toBeGreaterThanOrEqual(90);

    const bestFree = registry.findBest('best-free', { freeOnly: true });
    expect(bestFree).toBeDefined();
    expect(bestFree!.metadata.pricing.free).toBe(true);
  });

  it('findModels with intent sorts correctly', () => {
    const registry = new ModelRegistry();
    const results = registry.findModels({ intent: 'fast', limit: 5 });
    expect(results.length).toBe(5);
    // Each subsequent model should not be faster than the previous
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.metadata.scores.speed)
        .toBeGreaterThanOrEqual(results[i]!.metadata.scores.speed);
    }
  });

  it('registerDiscovered adds new models', () => {
    const registry = new ModelRegistry();
    const initialSize = registry.size();

    registry.registerDiscovered('custom', {
      id: 'custom-model-v1',
      name: 'Custom Model V1',
      provider: 'custom',
      contextWindow: 32_000,
      supportsToolCalling: true,
      supportsStreaming: true,
      isFree: true,
    });

    expect(registry.size()).toBe(initialSize + 1);
    const reg = registry.getModel('custom-model-v1', 'custom');
    expect(reg).toBeDefined();
    expect(reg!.source).toBe('discovered');
    expect(reg!.metadata.discovered).toBe(true);
  });

  it('registerDiscovered updates existing models', () => {
    const registry = new ModelRegistry();
    const initial = registry.getModel('gpt-4o', 'openai')!;
    expect(initial.metadata.discovered).toBe(false);

    registry.registerDiscovered('openai', {
      id: 'gpt-4o',
      name: 'GPT-4o Discovered',
      provider: 'openai',
      contextWindow: 200_000,
      supportsToolCalling: true,
      supportsStreaming: true,
      isFree: false,
    });

    const updated = registry.getModel('gpt-4o', 'openai')!;
    expect(updated.metadata.discovered).toBe(true);
  });

  it('getByProvider returns empty for unknown provider', () => {
    const registry = new ModelRegistry();
    const results = registry.getByProvider('nonexistent');
    expect(results).toEqual([]);
  });

  it('change callbacks fire on registration', () => {
    const registry = new ModelRegistry();
    let called = false;
    registry.onChange(() => {
      called = true;
    });
    registry.registerDiscovered('test', {
      id: 'test-model',
      name: 'Test',
      provider: 'test',
      contextWindow: 8192,
      supportsToolCalling: false,
      supportsStreaming: false,
      isFree: true,
    });
    expect(called).toBe(true);
  });
});
