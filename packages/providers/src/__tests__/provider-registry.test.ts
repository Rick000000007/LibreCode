import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../provider-registry.js';

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('has built-in providers', () => {
    const all = registry.all();
    expect(all.length).toBeGreaterThan(10);
    expect(registry.exists('openai')).toBe(true);
    expect(registry.exists('anthropic')).toBe(true);
    expect(registry.exists('ollama')).toBe(true);
  });

  it('get returns metadata for built-in providers', () => {
    const meta = registry.get('openai');
    expect(meta).toBeDefined();
    expect(meta!.name).toBe('OpenAI');
    expect(meta!.requiresApiKey).toBe(true);
    expect(meta!.hasFreeTier).toBe(false);
  });

  describe('registerCustom', () => {
    it('registers a custom provider', () => {
      registry.registerCustom({
        id: 'my-provider',
        name: 'My Provider',
        baseUrl: 'https://my-api.example.com/v1',
        defaultModel: 'my-model',
      });
      expect(registry.exists('my-provider')).toBe(true);
      expect(registry.isCustom('my-provider')).toBe(true);
    });

    it('throws on duplicate custom provider', () => {
      registry.registerCustom({
        id: 'my-provider',
        name: 'My Provider',
        baseUrl: 'https://my-api.example.com/v1',
        defaultModel: 'my-model',
      });
      expect(() =>
        registry.registerCustom({
          id: 'my-provider',
          name: 'My Provider Dup',
          baseUrl: 'https://my-api-2.example.com/v1',
          defaultModel: 'my-model',
        }),
      ).toThrow('Duplicate custom provider');
    });

    it('throws on collision with built-in provider', () => {
      expect(() =>
        registry.registerCustom({
          id: 'openai',
          name: 'My OpenAI',
          baseUrl: 'https://my-openai.example.com/v1',
          defaultModel: 'my-model',
        }),
      ).toThrow('built-in provider');
    });

    it('throws on empty id', () => {
      expect(() =>
        registry.registerCustom({
          id: '',
          name: 'Empty',
          baseUrl: 'https://api.example.com/v1',
          defaultModel: 'm',
        }),
      ).toThrow('non-empty id');
    });

    it('throws on missing baseUrl', () => {
      expect(() =>
        registry.registerCustom({
          id: 'no-url',
          name: 'No URL',
          baseUrl: '',
          defaultModel: 'm',
        }),
      ).toThrow('baseUrl');
    });
  });

  describe('unregisterCustom', () => {
    it('removes a custom provider', () => {
      registry.registerCustom({
        id: 'test-provider',
        name: 'Test',
        baseUrl: 'https://test.example.com/v1',
        defaultModel: 'm',
      });
      expect(registry.isCustom('test-provider')).toBe(true);
      expect(registry.unregisterCustom('test-provider')).toBe(true);
      expect(registry.isCustom('test-provider')).toBe(false);
    });

    it('returns false for non-existent provider', () => {
      expect(registry.unregisterCustom('nonexistent')).toBe(false);
    });
  });

  describe('getCustomDefinitions', () => {
    it('returns all custom providers', () => {
      registry.registerCustom({
        id: 'a',
        name: 'A',
        baseUrl: 'https://a.example.com/v1',
        defaultModel: 'm',
      });
      registry.registerCustom({
        id: 'b',
        name: 'B',
        baseUrl: 'https://b.example.com/v1',
        defaultModel: 'm',
      });
      const defs = registry.getCustomDefinitions();
      expect(defs).toHaveLength(2);
    });
  });

  describe('restoreCustomFromConfig', () => {
    it('restores custom providers from config entries', () => {
      const config = {
        defaultProvider: 'custom1',
        providers: {
          custom1: {
            enabled: true,
            endpoint: 'https://custom1.example.com/v1',
            defaultModel: 'model-1',
            apiKey: 'sk-custom1',
          },
          custom2: {
            enabled: false,
            endpoint: 'https://custom2.example.com/v1',
            defaultModel: 'model-2',
          },
        },
      };
      const count = registry.restoreCustomFromConfig(config);
      expect(count).toBe(2);
      expect(registry.isCustom('custom1')).toBe(true);
      expect(registry.isCustom('custom2')).toBe(true);
      expect(registry.getBaseUrl('custom1')).toBe('https://custom1.example.com/v1');
    });

    it('skips built-in provider IDs', () => {
      const config = {
        defaultProvider: 'openai',
        providers: {
          openai: { enabled: true, endpoint: 'https://api.openai.com/v1' },
        },
      };
      const count = registry.restoreCustomFromConfig(config);
      expect(count).toBe(0);
      expect(registry.isCustom('openai')).toBe(false);
    });
  });

  describe('deriveCapabilities', () => {
    it('returns capabilities for built-in provider', () => {
      const caps = registry.deriveCapabilities('openai');
      expect(caps.chatCompletions).toBe(true);
      expect(caps.streaming).toBe(true);
      expect(caps.toolCalling).toBe(true);
      expect(caps.responsesApi).toBe(false);
      expect(caps.embeddings).toBe(false);
      expect(caps.modelDiscovery).toBe(false);
    });

    it('returns custom capabilities for custom provider when provided', () => {
      registry.registerCustom({
        id: 'my-provider',
        name: 'My Provider',
        baseUrl: 'https://my-api.example.com/v1',
        defaultModel: 'my-model',
        capabilities: {
          streaming: false,
          toolCalling: false,
        },
      });
      const caps = registry.deriveCapabilities('my-provider');
      expect(caps.streaming).toBe(false);
      expect(caps.toolCalling).toBe(false);
      expect(caps.chatCompletions).toBe(true);
    });

    it('returns default capabilities for custom provider without capabilities defined', () => {
      registry.registerCustom({
        id: 'my-provider',
        name: 'My Provider',
        baseUrl: 'https://my-api.example.com/v1',
        defaultModel: 'my-model',
      });
      const caps = registry.deriveCapabilities('my-provider');
      expect(caps.streaming).toBe(true);
      expect(caps.toolCalling).toBe(true);
    });

    it('returns default capabilities for unknown provider', () => {
      const caps = registry.deriveCapabilities('nonexistent');
      expect(caps.chatCompletions).toBe(true);
      expect(caps.toolCalling).toBe(true);
    });
  });

  describe('helper methods', () => {
    it('requiresApiKey returns correct value', () => {
      expect(registry.requiresApiKey('openai')).toBe(true);
      expect(registry.requiresApiKey('ollama')).toBe(false);
    });

    it('hasFreeTier returns correct value', () => {
      expect(registry.hasFreeTier('gemini')).toBe(true);
      expect(registry.hasFreeTier('openai')).toBe(false);
    });

    it('getBaseUrl returns correct URL', () => {
      expect(registry.getBaseUrl('openai')).toBe('https://api.openai.com/v1');
    });

    it('getEnvKey returns correct env var name', () => {
      expect(registry.getEnvKey('openai')).toBe('OPENAI_API_KEY');
      expect(registry.getEnvKey('custom')).toBe('CUSTOM_API_KEY');
    });

    it('getCustomHeaders returns custom headers for providers', () => {
      const headers = registry.getCustomHeaders('openrouter');
      expect(headers).toBeDefined();
      expect(headers!['HTTP-Referer']).toBeDefined();
    });

    it('freeTierProviders returns only providers with free tier', () => {
      const free = registry.freeTierProviders();
      expect(free.length).toBeGreaterThan(5);
      free.forEach((p) => expect(p.hasFreeTier).toBe(true));
    });

    it('localProviders returns providers without API key requirement', () => {
      const local = registry.localProviders();
      expect(local.length).toBeGreaterThan(0);
      local.forEach((p) => expect(p.requiresApiKey).toBe(false));
    });
  });
});
