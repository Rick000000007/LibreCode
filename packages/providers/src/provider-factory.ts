import type { LLMProvider } from './base.js';
import { LlmError } from './base.js';
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
    const trimmedName = name.trim();
    const meta = this.registry.get(trimmedName);
    const builtin = this.registry.getBuiltin(trimmedName);

    if (trimmedName === 'free') {
      return this.createFreeProvider(entry);
    }

    if (!meta) {
      const available = this.registry.all().map((p) => p.id).join(', ');
      throw new Error(
        `Unknown provider: '${trimmedName}'. Available providers: ${available}\n` +
        `To add a custom provider, configure it in your config file or run \`librecode provider login ${trimmedName}\`.`,
      );
    }

    const model = entry.defaultModel?.trim() || meta.defaultModel;
    const endpoint = entry.endpoint?.trim() || this.registry.getBaseUrl(trimmedName) || 'https://api.openai.com/v1';
    const customHeaders = entry.customHeaders ?? this.registry.getCustomHeaders(trimmedName);

    let apiKey = entry.apiKey?.trim() || undefined;
    if (!apiKey && builtin?.envKey) {
      apiKey = process.env[builtin.envKey] || undefined;
    }
    if (!apiKey) {
      const envKey = this.registry.getEnvKey(trimmedName);
      apiKey = process.env[envKey] || undefined;
    }

    if (!apiKey && meta.requiresApiKey) {
      const envKey = this.registry.getEnvKey(trimmedName);
      throw LlmError.authError(
        `No API key found for provider '${trimmedName}'. Set it via config or the appropriate environment variable (${envKey}), or run \`librecode provider login ${trimmedName}\`.`,
      );
    }

    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      throw new Error(
        `Invalid endpoint for provider '${trimmedName}': "${endpoint}". ` +
        `Endpoint must start with http:// or https://`,
      );
    }

    return new OpenAICompatibleProvider({
      name: trimmedName,
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
    return new FreeProvider();
  }
}
