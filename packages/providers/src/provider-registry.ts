import type { ProviderMetadata, ProviderDefinition, ProviderCapabilities } from 'librecode-types';
import type { LibreConfig } from 'librecode-types';

interface BuiltinProvider {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  requiresApiKey: boolean;
  hasFreeTier: boolean;
  website: string;
  defaultModel: string;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  docsUrl: string;
  keyUrl: string;
  envKey: string;
  customHeaders?: Record<string, string>;
  /** Custom chat completions path (default: /chat/completions) */
  chatPath?: string;
  /** Custom model discovery path (default: /models) */
  modelsPath?: string;
}

const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  {
    id: 'free',
    name: 'Free Models',
    description: 'Free-tier models from multiple providers (Ollama, Gemini, Groq, OpenRouter). No API key required for local models.',
    baseUrl: '',
    requiresApiKey: false,
    hasFreeTier: true,
    website: '',
    defaultModel: 'auto',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: '',
    keyUrl: '',
    envKey: '',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, and other OpenAI models',
    baseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://platform.openai.com',
    defaultModel: 'gpt-4o',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    keyUrl: 'https://platform.openai.com/api-keys',
    envKey: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Sonnet, Claude Haiku via OpenAI-compatible endpoint',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://console.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.anthropic.com/en/api',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    envKey: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini models with free tier available',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://ai.google.dev',
    defaultModel: 'gemini-2.0-flash',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://ai.google.dev/api',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    envKey: 'GEMINI_API_KEY',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally with Ollama. No API key needed.',
    baseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    hasFreeTier: true,
    website: 'https://ollama.com',
    defaultModel: 'codellama',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://github.com/ollama/ollama/tree/main/docs',
    keyUrl: '',
    envKey: '',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified API for 200+ models with free tier models',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://openrouter.ai',
    defaultModel: 'openai/gpt-4o',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://openrouter.ai/docs',
    keyUrl: 'https://openrouter.ai/keys',
    envKey: 'OPENROUTER_API_KEY',
    customHeaders: { 'HTTP-Referer': 'https://github.com/Rick000000007/LibreCode' },
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    description: 'NVIDIA NIM microservices with free tier',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://build.nvidia.com',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
    keyUrl: 'https://build.nvidia.com/explore/docs',
    envKey: 'NVIDIA_API_KEY',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Fast inference with Groq hardware. Free tier available.',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://groq.com',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://console.groq.com/docs',
    keyUrl: 'https://console.groq.com/keys',
    envKey: 'GROQ_API_KEY',
  },
  {
    id: 'together',
    name: 'Together AI',
    description: '100+ open-source models via API',
    baseUrl: 'https://api.together.xyz/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://together.ai',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.together.ai',
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    envKey: 'TOGETHER_API_KEY',
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    description: 'Serverless inference for open-source models',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://deepinfra.com',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://deepinfra.com/docs',
    keyUrl: 'https://deepinfra.com/dash/account/api',
    envKey: 'DEEPINFRA_API_KEY',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'Fast inference for open-source and custom models',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://fireworks.ai',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.fireworks.ai',
    keyUrl: 'https://fireworks.ai/account/api-keys',
    envKey: 'FIREWORKS_API_KEY',
  },
  {
    id: 'hyperbolic',
    name: 'Hyperbolic',
    description: 'Decentralized AI inference',
    baseUrl: 'https://api.hyperbolic.xyz/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://hyperbolic.xyz',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.hyperbolic.xyz',
    keyUrl: 'https://app.hyperbolic.xyz/settings',
    envKey: 'HYPERBOLIC_API_KEY',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    description: 'Wafer-scale AI acceleration',
    baseUrl: 'https://api.cerebras.ai/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://cerebras.ai',
    defaultModel: 'llama3.1-8b',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.cerebras.ai',
    keyUrl: 'https://cloud.cerebras.ai/api-keys',
    envKey: 'CEREBRAS_API_KEY',
  },
  {
    id: 'xai',
    name: 'xAI',
    description: 'xAI Grok models',
    baseUrl: 'https://api.x.ai/v1',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://x.ai',
    defaultModel: 'grok-2-latest',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.x.ai',
    keyUrl: 'https://console.x.ai/',
    envKey: 'XAI_API_KEY',
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    description: 'Enterprise AI inference',
    baseUrl: 'https://api.sambanova.ai/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://sambanova.ai',
    defaultModel: 'Meta-Llama-3.3-70B-Instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.sambanova.ai',
    keyUrl: 'https://cloud.sambanova.ai/account',
    envKey: 'SAMBANOVA_API_KEY',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    description: 'Run models locally via LM Studio. No API key needed.',
    baseUrl: 'http://localhost:1234/v1',
    requiresApiKey: false,
    hasFreeTier: true,
    website: 'https://lmstudio.ai',
    defaultModel: 'local-model',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://lmstudio.ai/docs/local-server',
    keyUrl: '',
    envKey: '',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral Large, Codestral, and open-weight models',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://mistral.ai',
    defaultModel: 'mistral-large-latest',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.mistral.ai/api',
    keyUrl: 'https://console.mistral.ai/api-keys/',
    envKey: 'MISTRAL_API_KEY',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Command R and Command R+ models',
    baseUrl: 'https://api.cohere.com/v1',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://cohere.com',
    defaultModel: 'command-r-plus',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.cohere.com/reference/about',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    envKey: 'COHERE_API_KEY',
  },
  {
    id: 'github',
    name: 'GitHub Models',
    description: 'Models hosted on GitHub. Note: retiring July 30, 2026.',
    baseUrl: 'https://models.github.ai',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://github.com/marketplace/models',
    defaultModel: 'openai/gpt-4o',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.github.com/en/github-models',
    keyUrl: 'https://github.com/settings/tokens?type=beta',
    envKey: 'GITHUB_TOKEN',
    chatPath: '/inference/chat/completions',
    modelsPath: '/catalog/models',
    customHeaders: {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Serverless Inference API',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://huggingface.co',
    defaultModel: 'meta-llama/Meta-Llama-3-8B-Instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://huggingface.co/docs/api-inference',
    keyUrl: 'https://huggingface.co/settings/tokens',
    envKey: 'HF_TOKEN',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Coder and Chat models',
    baseUrl: 'https://api.deepseek.com',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://deepseek.com',
    defaultModel: 'deepseek-chat',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://platform.deepseek.com/api-docs',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    envKey: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Sonar models with search capabilities',
    baseUrl: 'https://api.perplexity.ai',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://perplexity.ai',
    defaultModel: 'llama-3.1-sonar-large-128k-online',
    supportsStreaming: true,
    supportsToolCalling: false,
    docsUrl: 'https://docs.perplexity.ai',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    envKey: 'PERPLEXITY_API_KEY',
  },
  {
    id: 'novita',
    name: 'Novita AI',
    description: 'Affordable AI inference',
    baseUrl: 'https://api.novita.ai/v1/openai',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://novita.ai',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://novita.ai/docs',
    keyUrl: 'https://novita.ai/settings/api-keys',
    envKey: 'NOVITA_API_KEY',
  },
  {
    id: 'featherless',
    name: 'Featherless',
    description: 'Serverless open-source model inference',
    baseUrl: 'https://api.featherless.ai/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://featherless.ai',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.featherless.ai',
    keyUrl: 'https://featherless.ai/account/api-keys',
    envKey: 'FEATHERLESS_API_KEY',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    description: 'Cloud-native AI inference',
    baseUrl: 'https://api.siliconflow.cn/v1',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://siliconflow.cn',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.siliconflow.cn',
    keyUrl: 'https://siliconflow.cn/account/api-key',
    envKey: 'SILICONFLOW_API_KEY',
  },
];

export class ProviderRegistry {
  private providers: Map<string, BuiltinProvider>;
  private customProviders: Map<string, ProviderDefinition>;

  constructor() {
    this.providers = new Map(BUILTIN_PROVIDERS.map((p) => [p.id, p]));
    this.customProviders = new Map();
  }

  all(): ProviderMetadata[] {
    const builtin = Array.from(this.providers.values()).map((p) => this.toMetadata(p));
    const custom = Array.from(this.customProviders.values()).map((p) => this.customToMetadata(p));
    return [...builtin, ...custom];
  }

  get(id: string): ProviderMetadata | undefined {
    const builtin = this.providers.get(id);
    if (builtin) return this.toMetadata(builtin);
    const custom = this.customProviders.get(id);
    return custom ? this.customToMetadata(custom) : undefined;
  }

  private customToMetadata(p: ProviderDefinition): ProviderMetadata {
    const defaults = this.deriveCapabilities(p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? `Custom OpenAI-compatible provider`,
      requiresApiKey: p.requiresApiKey ?? !!p.apiKey,
      hasFreeTier: p.hasFreeTier ?? false,
      website: p.website ?? '',
      defaultModel: p.defaultModel,
      supportsStreaming: defaults.streaming,
      supportsToolCalling: defaults.toolCalling,
      docsUrl: p.docsUrl ?? '',
    };
  }

  getBuiltin(id: string): BuiltinProvider | undefined {
    return this.providers.get(id);
  }

  exists(id: string): boolean {
    return this.providers.has(id) || this.customProviders.has(id);
  }

  isCustom(id: string): boolean {
    return this.customProviders.has(id);
  }

  requiresApiKey(id: string): boolean {
    const builtin = this.providers.get(id);
    if (builtin) return builtin.requiresApiKey;
    const custom = this.customProviders.get(id);
    if (custom) return custom.requiresApiKey ?? !!custom.apiKey;
    return true;
  }

  hasFreeTier(id: string): boolean {
    return this.providers.get(id)?.hasFreeTier ?? this.customProviders.get(id)?.hasFreeTier ?? false;
  }

  getBaseUrl(id: string): string | undefined {
    return this.providers.get(id)?.baseUrl ?? this.customProviders.get(id)?.baseUrl;
  }

  getEnvKey(id: string): string {
    return this.providers.get(id)?.envKey ?? `${id.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  }

  getCustomHeaders(id: string): Record<string, string> | undefined {
    return this.providers.get(id)?.customHeaders ?? this.customProviders.get(id)?.customHeaders;
  }

  getKeyUrl(id: string): string | undefined {
    return this.providers.get(id)?.keyUrl;
  }

  freeTierProviders(): ProviderMetadata[] {
    return this.all().filter((p) => p.hasFreeTier);
  }

  localProviders(): ProviderMetadata[] {
    return Array.from(this.providers.values())
      .filter((p) => !p.requiresApiKey)
      .map((p) => this.toMetadata(p));
  }

  registerCustom(definition: ProviderDefinition): void {
    if (!definition.id || !definition.id.trim()) {
      throw new Error(
        `Failed to register custom provider.\n` +
        `This happens because the provider definition is missing an 'id'.\n\n` +
        `To fix this, edit your config file and add an 'id' field to the provider.\n\n` +
        `Next step: Run \`/config path\` to locate and edit your config file.`
      );
    }
    const id = definition.id.trim();
    if (this.providers.has(id)) {
      throw new Error(
        `Cannot register custom provider '${id}'.\n` +
        `This happens because a built-in provider with this name already exists.\n\n` +
        `To fix this, choose a different name for your custom provider in your config file.\n\n` +
        `Next step: Run \`/config path\` to locate and edit your config file.`
      );
    }
    if (this.customProviders.has(id)) {
      throw new Error(
        `Duplicate custom provider '${id}'.\n` +
        `This happens because multiple custom providers share the same 'id'.\n\n` +
        `To fix this, ensure each custom provider in your config file has a unique 'id'.\n\n` +
        `Next step: Run \`/config path\` to locate and edit your config file.`
      );
    }
    if (!definition.baseUrl || !definition.baseUrl.trim()) {
      throw new Error(
        `The baseUrl for custom provider '${id}' is missing.\n` +
        `This happens because the provider definition requires a valid 'baseUrl' to send requests.\n\n` +
        `To fix this, add a 'baseUrl' starting with http:// or https:// to your provider config.\n\n` +
        `Next step: Run \`/config path\` to locate and edit your config file.`
      );
    }
    this.customProviders.set(id, definition);
  }

  unregisterCustom(id: string): boolean {
    return this.customProviders.delete(id);
  }

  getCustomDefinitions(): ProviderDefinition[] {
    return Array.from(this.customProviders.values());
  }

  restoreCustomFromConfig(config: LibreConfig): number {
    let count = 0;
    for (const [id, entry] of Object.entries(config.providers)) {
      if (this.providers.has(id)) continue;
      if (this.customProviders.has(id)) continue;
      if (!entry.endpoint) continue;

      try {
        this.customProviders.set(id, {
          id,
          name: id,
          baseUrl: entry.endpoint,
          apiKey: entry.apiKey,
          defaultModel: entry.defaultModel ?? 'gpt-4o',
          description: `Custom OpenAI-compatible provider`,
          requiresApiKey: !!entry.apiKey || entry.endpoint !== 'http://localhost:11434/v1',
        });
        count++;
      } catch {
        /* skip invalid entries */
      }
    }
    return count;
  }

  deriveCapabilities(id: string): ProviderCapabilities {
    const builtin = this.providers.get(id);

    if (builtin) {
      return {
        chatCompletions: true,
        responsesApi: false,
        streaming: builtin.supportsStreaming,
        vision: false,
        toolCalling: builtin.supportsToolCalling,
        reasoning: false,
        jsonMode: false,
        embeddings: false,
        modelDiscovery: false,
        browserLogin: false,
        deviceFlow: false,
        apiKeys: builtin.requiresApiKey,
        localServer: !builtin.requiresApiKey && (builtin.id === 'ollama' || builtin.id === 'lmstudio'),
      };
    }

    const custom = this.customProviders.get(id);
    if (custom?.capabilities) {
      return {
        chatCompletions: true,
        responsesApi: false,
        streaming: true,
        vision: false,
        toolCalling: true,
        reasoning: false,
        jsonMode: false,
        embeddings: false,
        modelDiscovery: false,
        browserLogin: false,
        deviceFlow: false,
        apiKeys: custom.requiresApiKey ?? !!custom.apiKey,
        localServer: false,
        ...custom.capabilities,
      };
    }

    return {
      chatCompletions: true,
      responsesApi: false,
      streaming: true,
      vision: false,
      toolCalling: true,
      reasoning: false,
      jsonMode: false,
      embeddings: false,
      modelDiscovery: false,
      browserLogin: false,
      deviceFlow: false,
      apiKeys: true,
      localServer: false,
    };
  }

  private toMetadata(p: BuiltinProvider): ProviderMetadata {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      requiresApiKey: p.requiresApiKey,
      hasFreeTier: p.hasFreeTier,
      website: p.website,
      defaultModel: p.defaultModel,
      supportsStreaming: p.supportsStreaming,
      supportsToolCalling: p.supportsToolCalling,
      docsUrl: p.docsUrl,
      keyUrl: p.keyUrl || undefined,
    };
  }
}
