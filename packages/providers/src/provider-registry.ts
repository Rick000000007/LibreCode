import type { ProviderMetadata } from 'librecode-types';

const BUILTIN_PROVIDERS: ProviderMetadata[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, and other OpenAI models',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://platform.openai.com',
    defaultModel: 'gpt-4o',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://platform.openai.com/docs/api-reference',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Sonnet, Claude Haiku, and other Anthropic models',
    requiresApiKey: true,
    hasFreeTier: false,
    website: 'https://console.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://docs.anthropic.com/en/api',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini models with free tier available',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://ai.google.dev',
    defaultModel: 'gemini-2.0-flash',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://ai.google.dev/api',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally with Ollama. No API key needed.',
    requiresApiKey: false,
    hasFreeTier: true,
    website: 'https://ollama.ai',
    defaultModel: 'codellama',
    supportsStreaming: true,
    supportsToolCalling: false,
    docsUrl: 'https://github.com/ollama/ollama/tree/main/docs',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified API for 200+ models with free tier models',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://openrouter.ai',
    defaultModel: 'openai/gpt-4o',
    supportsStreaming: true,
    supportsToolCalling: true,
    docsUrl: 'https://openrouter.ai/docs',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    description: 'NVIDIA NIM microservices with free tier',
    requiresApiKey: true,
    hasFreeTier: true,
    website: 'https://build.nvidia.com',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    supportsStreaming: true,
    supportsToolCalling: false,
    docsUrl: 'https://build.nvidia.com/docs',
  },
];

export class ProviderRegistry {
  private providers: Map<string, ProviderMetadata>;

  constructor() {
    this.providers = new Map(BUILTIN_PROVIDERS.map((p) => [p.id, p]));
  }

  all(): ProviderMetadata[] {
    return Array.from(this.providers.values());
  }

  get(id: string): ProviderMetadata | undefined {
    return this.providers.get(id);
  }

  exists(id: string): boolean {
    return this.providers.has(id);
  }

  requiresApiKey(id: string): boolean {
    return this.providers.get(id)?.requiresApiKey ?? true;
  }

  hasFreeTier(id: string): boolean {
    return this.providers.get(id)?.hasFreeTier ?? false;
  }

  freeTierProviders(): ProviderMetadata[] {
    return BUILTIN_PROVIDERS.filter((p) => p.hasFreeTier);
  }

  localProviders(): ProviderMetadata[] {
    return BUILTIN_PROVIDERS.filter((p) => !p.requiresApiKey);
  }
}
