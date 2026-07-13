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
        `Could not find an AI provider named '${trimmedName}'.\n` +
        `This happens because the provider name is misspelled or hasn't been configured yet.\n\n` +
        `To fix this, you can choose from the available providers: ${available}.\n\n` +
        `Next step: Run \`/provider switch\` to select a valid provider, or \`/setup\` to configure a new one.`
      );
    }

    const model = entry.defaultModel?.trim() || meta.defaultModel;
    const endpoint = entry.endpoint?.trim() || this.registry.getBaseUrl(trimmedName);
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
        `Missing API key for '${trimmedName}'.\n` +
        `This happens because the provider requires an API key, but none was found in your configuration or environment variables.\n\n` +
        `To fix this, you need to provide your API key for ${trimmedName}.\n\n` +
        `Next step: Run \`/provider login ${trimmedName}\` to securely store your API key, or set the ${envKey} environment variable.`
      );
    }

    if (!endpoint || (!endpoint.startsWith('http://') && !endpoint.startsWith('https://'))) {
      throw new Error(
        `The endpoint URL "${endpoint}" for '${trimmedName}' is invalid.\n` +
        `This happens because the URL is missing the protocol (http:// or https://).\n\n` +
        `To fix this, update the provider configuration with a complete URL starting with http:// or https://.\n\n` +
        `Next step: Run \`/config path\` to find your config file and fix the endpoint URL.`
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
