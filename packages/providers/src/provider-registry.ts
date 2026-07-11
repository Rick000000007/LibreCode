import type { ProviderMetadata, ProviderDefinition } from 'librecode-types';

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
  envKey: string;
  customHeaders?: Record<string, string>;
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
    envKey: 'GEMINI_API_KEY',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally with Ollama. No API key needed.',
    baseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    hasFreeTier: true,
    website: 'https://ollama.ai',
    defaultModel: 'codellama',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://github.com/ollama/ollama/tree/main/docs',
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
    docsUrl: 'https://build.nvidia.com/docs',
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
    envKey: 'HYPERBOLIC_API_KEY',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    description: 'Wafer-scale AI acceleration',
    baseUrl: 'https://api.cerebras.ai/v1',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://cerebras.ai',
    defaultModel: 'llama-3.3-70b',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.cerebras.ai',
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
    defaultModel: 'grok-2',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.x.ai',
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
    envKey: 'SAMBANOVA_API_KEY',
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
    const custom = Array.from(this.customProviders.values()).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? `Custom OpenAI-compatible provider`,
      requiresApiKey: p.requiresApiKey ?? !!p.apiKey,
      hasFreeTier: p.hasFreeTier ?? false,
      website: p.website ?? '',
      defaultModel: p.defaultModel,
      supportsStreaming: true,
      supportsToolCalling: true,
      docsUrl: p.docsUrl ?? '',
    }));
    return [...builtin, ...custom];
  }

  get(id: string): ProviderMetadata | undefined {
    const builtin = this.providers.get(id);
    if (builtin) return this.toMetadata(builtin);
    const custom = this.customProviders.get(id);
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        description: custom.description ?? `Custom OpenAI-compatible provider`,
        requiresApiKey: custom.requiresApiKey ?? !!custom.apiKey,
        hasFreeTier: custom.hasFreeTier ?? false,
        website: custom.website ?? '',
        defaultModel: custom.defaultModel,
        supportsStreaming: true,
        supportsToolCalling: true,
        docsUrl: custom.docsUrl ?? '',
      };
    }
    return undefined;
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

  freeTierProviders(): ProviderMetadata[] {
    return this.all().filter((p) => p.hasFreeTier);
  }

  localProviders(): ProviderMetadata[] {
    return Array.from(this.providers.values())
      .filter((p) => !p.requiresApiKey)
      .map((p) => this.toMetadata(p));
  }

  registerCustom(definition: ProviderDefinition): void {
    this.customProviders.set(definition.id, definition);
  }

  unregisterCustom(id: string): boolean {
    return this.customProviders.delete(id);
  }

  getCustomDefinitions(): ProviderDefinition[] {
    return Array.from(this.customProviders.values());
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
    };
  }
}
