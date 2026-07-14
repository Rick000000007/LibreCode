import type { LLMProvider } from './base.js';
import { LlmError } from './base.js';
import { AdapterBridge } from './adapter-bridge.js';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible-adapter.js';
import { AnthropicAdapter } from './adapters/anthropic-adapter.js';
import { FreeProvider } from './free-models.js';
import { AuthManager } from './auth-manager.js';
import { PluginLoader } from './plugin-loader.js';
import type { ProviderEntry } from 'librecode-types';
import { ProviderRegistry } from './provider-registry.js';
import type { ProviderDescriptor, Capability, AuthType } from './types/provider-descriptor.js';
import { BUILTIN_PROVIDERS } from './provider-descriptors.js';

const DESCRIPTOR_MAP = new Map<string, ProviderDescriptor>();
for (const d of BUILTIN_PROVIDERS) {
  DESCRIPTOR_MAP.set(d.id, d);
}

export class ProviderFactory {
  private registry: ProviderRegistry;
  private pluginLoader: PluginLoader;
  private authManager: AuthManager;

  constructor(registry: ProviderRegistry, pluginLoader?: PluginLoader, authManager?: AuthManager) {
    this.registry = registry;
    this.pluginLoader = pluginLoader ?? new PluginLoader();
    this.authManager = authManager ?? new AuthManager();
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

    const adapter = this.createAdapter(
      trimmedName,
      meta,
      builtin,
      {
        baseUrl: endpoint,
        apiKey,
        defaultModel: model,
        organization: entry.organization,
        project: entry.project,
        customHeaders,
        chatPath: builtin?.chatPath,
        modelsPath: builtin?.modelsPath,
      },
    );

    const descriptor = this.getDescriptor(trimmedName);
    const capabilities = descriptor?.capabilities ?? this.inferCapabilities(meta, builtin);

    return new AdapterBridge(adapter, model, capabilities);
  }

  private createAdapter(
    id: string,
    meta: Awaited<ReturnType<ProviderRegistry['get']>>,
    builtin: Awaited<ReturnType<ProviderRegistry['getBuiltin']>> | undefined,
    config: {
      baseUrl: string;
      apiKey?: string;
      defaultModel: string;
      organization?: string;
      project?: string;
      customHeaders?: Record<string, string>;
      chatPath?: string;
      modelsPath?: string;
    },
  ): import('./types/adapter.js').ProviderAdapter {
    const descriptor = this.getDescriptor(id);
    const authType: AuthType = descriptor?.authType ?? { type: 'bearer', envVar: this.registry.getEnvKey(id) };
    const capabilities: Capability[] = descriptor?.capabilities ?? [];
    const adapterType = descriptor?.adapterType ?? 'openai-compatible';

    if (adapterType === 'custom') {
      if (id === 'anthropic') {
        return new AnthropicAdapter();
      }
    }

    let pluginAdapter: import('./types/adapter.js').ProviderAdapter | null = null;
    if (adapterType === 'plugin') {
      const pluginId = descriptor?.adapterModule;
      if (pluginId) {
        try {
          const plugin = this.pluginLoader.get(pluginId);
          if (plugin) {
            pluginAdapter = plugin.createAdapter({ ...config, apiKey: config.apiKey });
          }
        } catch {
        }
      }
    }

    if (pluginAdapter) return pluginAdapter;

    return new OpenAICompatibleAdapter({
      providerId: id,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      apiKey: config.apiKey,
      authType,
      capabilities,
      organization: config.organization,
      project: config.project,
      customHeaders: config.customHeaders,
      chatPath: config.chatPath,
      modelsPath: config.modelsPath,
    });
  }

  private getDescriptor(id: string): ProviderDescriptor | undefined {
    return DESCRIPTOR_MAP.get(id);
  }

  private inferCapabilities(
    meta: Awaited<ReturnType<ProviderRegistry['get']>>,
    builtin: Awaited<ReturnType<ProviderRegistry['getBuiltin']>> | undefined,
  ): Capability[] {
    const caps: Capability[] = ['chat'];
    if (builtin?.supportsStreaming ?? meta?.supportsStreaming) caps.push('streaming');
    if (builtin?.supportsToolCalling ?? meta?.supportsToolCalling) caps.push('tools');
    return caps;
  }

  createAdapterInstance(id: string, entry: ProviderEntry): import('./types/adapter.js').ProviderAdapter | null {
    const adapter = this.createAdapter(
      id,
      this.registry.get(id),
      this.registry.getBuiltin(id),
      {
        baseUrl: entry.endpoint?.trim() || this.registry.getBaseUrl(id) || '',
        apiKey: entry.apiKey,
        defaultModel: entry.defaultModel?.trim() || this.registry.get(id)?.defaultModel || 'gpt-4o',
        organization: entry.organization,
        project: entry.project,
        customHeaders: entry.customHeaders,
      },
    );
    return adapter;
  }

  private createFreeProvider(_entry: ProviderEntry): LLMProvider {
    return new FreeProvider();
  }
}
