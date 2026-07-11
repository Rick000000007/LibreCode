import { describe, it, expect } from 'vitest';
import { KNOWN_MODELS, getKnownModel, findModels, scoreForIntent, isModelAlias } from '../model-metadata.js';

describe('model-metadata', () => {
  it('has all known models defined', () => {
    expect(KNOWN_MODELS.length).toBeGreaterThan(15);
  });

  it('each model has valid scores (0-100)', () => {
    for (const m of KNOWN_MODELS) {
      expect(m.scores.coding).toBeGreaterThanOrEqual(0);
      expect(m.scores.coding).toBeLessThanOrEqual(100);
      expect(m.scores.overall).toBeGreaterThanOrEqual(0);
      expect(m.scores.overall).toBeLessThanOrEqual(100);
    }
  });

  it('getKnownModel finds by id', () => {
    const gpt4o = getKnownModel('gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.provider).toBe('openai');
    expect(gpt4o!.family).toBe('gpt');
    expect(gpt4o!.pricing.free).toBe(false);
  });

  it('getKnownModel returns undefined for unknown', () => {
    expect(getKnownModel('nonexistent-model')).toBeUndefined();
  });

  it('findModels filters by freeOnly', () => {
    const free = findModels({ freeOnly: true });
    expect(free.length).toBeGreaterThan(0);
    for (const m of free) {
      expect(m.pricing.free).toBe(true);
    }
  });

  it('findModels filters by provider', () => {
    const openai = findModels({ provider: 'openai' });
    for (const m of openai) {
      expect(m.provider).toBe('openai');
    }
  });

  it('findModels filters by aliases', () => {
    const bestFree = findModels({ aliases: 'best-free' as any, freeOnly: true });
    expect(bestFree.length).toBeGreaterThan(0);
    for (const m of bestFree) {
      expect(m.aliases).toContain('best-free');
      expect(m.pricing.free).toBe(true);
    }
  });

  it('scoreForIntent returns correct scores', () => {
    const gpt4o = getKnownModel('gpt-4o')!;
    expect(scoreForIntent(gpt4o, 'coding')).toBe(gpt4o.scores.coding);
    expect(scoreForIntent(gpt4o, 'reasoning')).toBe(gpt4o.scores.reasoning);
    expect(scoreForIntent(gpt4o, 'fast')).toBe(gpt4o.scores.speed);
    expect(scoreForIntent(gpt4o, 'auto')).toBe(gpt4o.scores.overall);

    // Vision intent returns 0 for non-vision models
    const noVision = getKnownModel('llama3.2')!;
    expect(noVision.capabilities.vision).toBe(false);
    expect(scoreForIntent(noVision, 'vision')).toBe(0);
  });

  it('scoreForIntent for best-free gives premium models 0', () => {
    const gpt4o = getKnownModel('gpt-4o')!;
    expect(gpt4o.pricing.free).toBe(false);
    expect(scoreForIntent(gpt4o, 'best-free')).toBe(0);
  });

  it('scoreForIntent for best-free gives free models their overall score', () => {
    const gemini = getKnownModel('gemini-2.0-flash')!;
    expect(gemini.pricing.free).toBe(true);
    expect(scoreForIntent(gemini, 'best-free')).toBe(gemini.scores.overall);
  });

  it('scoreForIntent cheap gives free models a bonus', () => {
    const free = getKnownModel('gemini-2.0-flash')!;
    const paid = getKnownModel('gpt-4o')!;
    const freeScore = scoreForIntent(free, 'cheap');
    const paidScore = scoreForIntent(paid, 'cheap');
    expect(freeScore).toBeGreaterThan(paidScore);
  });

  it('isModelAlias validates correctly', () => {
    expect(isModelAlias('auto')).toBe(true);
    expect(isModelAlias('best-free')).toBe(true);
    expect(isModelAlias('coding')).toBe(true);
    expect(isModelAlias('nonexistent')).toBe(false);
    expect(isModelAlias('gpt-4o')).toBe(false);
  });

  it('models have correct structure', () => {
    for (const m of KNOWN_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.provider).toBeTruthy();
      expect(m.family).toBeTruthy();
      expect(m.displayName).toBeTruthy();
      expect(m.contextWindow).toBeGreaterThan(0);
      expect(m.capabilities).toBeDefined();
      expect(typeof m.capabilities.toolCalling).toBe('boolean');
      expect(typeof m.capabilities.vision).toBe('boolean');
      expect(Array.isArray(m.aliases)).toBe(true);
    }
  });
});
