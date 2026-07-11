import type { LLMProvider } from './base.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { FreeProvider } from './free-models.js';
import type { ProviderEntry } from 'librecode-types';
import { ProviderRegistry } from './provider-registry.js';

export class ProviderFactory {
  private registry: ProviderRegistry;

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  create(name: string, entry: ProviderEntry): LLMProvider {
    const meta = this.registry.get(name);
    const builtin = this.registry.getBuiltin(name);

    if (name === 'free') {
      return this.createFreeProvider(entry);
    }

    if (!meta) {
      throw new Error(
        `Unknown provider: '${name}'. Available providers: ${this.registry.all().map((p) => p.id).join(', ')}\n` +
        `To add a custom provider, configure it in your config file or run \`librecode provider login ${name}\`.`,
      );
    }

    const model = entry.defaultModel ?? meta.defaultModel;
    const apiKey = entry.apiKey ?? (builtin ? process.env[builtin.envKey] : process.env[this.registry.getEnvKey(name)]);
    const endpoint = entry.endpoint ?? this.registry.getBaseUrl(name) ?? 'https://api.openai.com/v1';
    const customHeaders = entry.customHeaders ?? this.registry.getCustomHeaders(name);

    return new OpenAICompatibleProvider({
      name,
      baseUrl: endpoint,
      apiKey,
      defaultModel: model,
      organization: entry.organization,
      project: entry.project,
      customHeaders,
      timeout: 30000,
    });
  }

  private createFreeProvider(_entry: ProviderEntry): LLMProvider {
    const provider = new FreeProvider();
    // autoDiscover will be called lazily on first use via ensureInitialized()
    return provider as unknown as LLMProvider;
  }
}
