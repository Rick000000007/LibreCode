import type { LLMProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenRouterProvider } from './openrouter.js';
import { GeminiProvider } from './gemini.js';
import type { ProviderEntry } from 'librecode-types';
import { ProviderRegistry } from './provider-registry.js';

export class ProviderFactory {
  private registry: ProviderRegistry;

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  create(name: string, entry: ProviderEntry): LLMProvider {
    const meta = this.registry.get(name);
    if (!meta) {
      throw new Error(`Unknown provider: ${name}`);
    }

    const model = entry.defaultModel ?? meta.defaultModel;
    const apiKey = entry.apiKey;
    const endpoint = entry.endpoint;

    switch (name) {
      case 'openai':
        return new OpenAIProvider({
          apiKey,
          baseUrl: endpoint,
          defaultModel: model,
        });
      case 'anthropic':
        return new AnthropicProvider({
          apiKey,
          baseUrl: endpoint,
          defaultModel: model,
        });
      case 'ollama':
        return new OllamaProvider({
          apiKey,
          baseUrl: endpoint ?? 'http://localhost:11434',
          defaultModel: model,
        });
      case 'openrouter':
        return new OpenRouterProvider({
          apiKey,
          baseUrl: endpoint,
          defaultModel: model,
        });
      case 'gemini':
        return new GeminiProvider({
          apiKey,
          baseUrl: endpoint,
          defaultModel: model,
        });
      default:
        throw new Error(`Provider '${name}' is not supported yet`);
    }
  }
}
