import { BaseProvider, LlmError } from './base.js';
import type { LLMProvider, ModelInfo, StreamCallback } from './base.js';
import type {
  CompletionRequest,
  CompletionResponse,
  HealthCheckResult,
} from 'librecode-types';
import { OpenAICompatibleProvider } from './openai-compatible.js';

/**
 * Built-in free model definitions.
 * Each entry describes a free-usage endpoint and one or more models available.
 * Models are ordered by priority (lower = tried first).
 */
interface FreeModelEndpoint {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  priority: number;
  requiresKey: boolean;
  category: 'fast' | 'reasoning' | 'balanced' | 'small' | 'code';
  /** Optional env var key name for API key */
  envKey?: string;
  /** Capability score (higher = better quality). Used by best-free alias. */
  capability: number;
}

const FREE_ENDPOINTS: FreeModelEndpoint[] = [
  // Ollama (local) - no API key needed, always lowest priority
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'qwen2.5', 'deepseek-coder'],
    priority: 1,
    requiresKey: false,
    category: 'balanced',
    capability: 30,
  },
  // Gemini via OpenAI-compatible endpoint - requires free API key
  {
    id: 'gemini',
    label: 'Gemini (Free Tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
    priority: 10,
    requiresKey: true,
    category: 'fast',
    envKey: 'GEMINI_API_KEY',
    capability: 100,
  },
  // OpenRouter free models - requires free API key
  {
    id: 'openrouter',
    label: 'OpenRouter (Free Models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash:free',
    models: [
      'google/gemini-2.0-flash:free',
      'meta-llama/llama-3.2-3b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'deepseek/deepseek-chat:free',
      'qwen/qwen-2.5-72b-instruct:free',
    ],
    priority: 20,
    requiresKey: true,
    category: 'balanced',
    envKey: 'OPENROUTER_API_KEY',
    capability: 85,
  },
  // NVIDIA free tier - requires free API key
  {
    id: 'nvidia',
    label: 'NVIDIA NIM (Free Tier)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    models: ['meta/llama-3.1-8b-instruct', 'mistralai/mistral-7b-instruct-v0.3'],
    priority: 30,
    requiresKey: true,
    category: 'balanced',
    envKey: 'NVIDIA_API_KEY',
    capability: 65,
  },
  // Groq free tier - requires free API key
  {
    id: 'groq',
    label: 'Groq (Free Tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    priority: 25,
    requiresKey: true,
    category: 'fast',
    envKey: 'GROQ_API_KEY',
    capability: 80,
  },
  // Together AI free tier
  {
    id: 'together',
    label: 'Together AI (Free Tier)',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    priority: 35,
    requiresKey: true,
    category: 'balanced',
    envKey: 'TOGETHER_API_KEY',
    capability: 70,
  },
];

/** Model alias map for convenience commands */
const MODEL_ALIASES: Record<string, string> = {
  'auto': '',           // auto-select best available
  'free': '',           // same as auto
  'best-free': '',      // pick the most capable available model
  'fast-free': 'gemini-2.0-flash',
  'reasoning-free': 'gemini-2.0-flash',
  'small-free': 'llama3.2',
  'code-free': 'codellama',
};

export class FreeProvider extends BaseProvider {
  private endpoints: Map<string, { provider: LLMProvider; info: FreeModelEndpoint }> = new Map();
  private activeModel = '';
  private fallbackOrder: string[] = [];
  private cooldowns: Map<string, number> = new Map();
  private healthCache: Map<string, { result: HealthCheckResult; time: number }> = new Map();
  private initialized = false;

  constructor() {
    super();
  }

  /**
   * Ensure auto-discovery has been run.
   * Called on first request if not already initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      this.autoDiscover().catch(() => {});
    }
  }

  override name(): string {
    return 'free';
  }

  override maxContextWindow(): number {
    let max = 128_000;
    for (const { provider } of this.endpoints.values()) {
      max = Math.max(max, provider.maxContextWindow());
    }
    return max;
  }

  override supportsStreaming(): boolean {
    return true;
  }

  override supportsToolCalling(): boolean {
    return true;
  }

  override supportsVision(): boolean {
    for (const { provider } of this.endpoints.values()) {
      if (provider.supportsVision()) return true;
    }
    return false;
  }

  override async listModels(): Promise<ModelInfo[]> {
    const result: ModelInfo[] = [];
    for (const [id, { provider, info }] of this.endpoints) {
      for (const m of info.models) {
        result.push({
          id: `${id}/${m}`,
          name: m,
          provider: id,
          contextWindow: provider.maxContextWindow(),
          supportsToolCalling: provider.supportsToolCalling(),
          supportsStreaming: provider.supportsStreaming(),
          isFree: true,
          category: info.category,
        });
      }
    }
    return result;
  }

  override getModel(): ModelInfo {
    return {
      id: this.activeModel || 'auto',
      name: this.activeModel || 'Auto (Free)',
      provider: 'free',
      contextWindow: this.maxContextWindow(),
      supportsToolCalling: true,
      supportsStreaming: true,
      isFree: true,
    };
  }

  override setModel(modelId: string): void {
    if (MODEL_ALIASES[modelId] !== undefined) {
      const resolved = MODEL_ALIASES[modelId]!;
      this.activeModel = resolved || this.pickBestModel();
    } else if (modelId.includes('/')) {
      // Format: provider/model
      this.activeModel = modelId;
    } else {
      // Just a model name - find which endpoint has it
      this.activeModel = modelId;
    }
  }

  private pickBestModel(): string {
    // Sort by capability descending (most capable first)
    const available = Array.from(this.endpoints.entries())
      .filter(([id]) => !this.isOnCooldown(id))
      .sort(([, a], [, b]) => b.info.capability - a.info.capability);

    if (available.length > 0) {
      return available[0]![1].info.defaultModel;
    }

    // All on cooldown — return the most capable anyway
    const sorted = Array.from(this.endpoints.entries())
      .sort(([, a], [, b]) => b.info.capability - a.info.capability);
    return sorted[0]?.[1]?.info.defaultModel ?? 'gpt-4o-mini';
  }

  /**
   * Initialize by registering a provider endpoint.
   * Called externally by ProviderManager.
   */
  registerEndpoint(id: string, provider: LLMProvider): void {
    const info = FREE_ENDPOINTS.find((e) => e.id === id);
    if (!info) return;

    this.endpoints.set(id, { provider, info });
    this.rebuildFallbackOrder();
  }

  /**
   * Auto-discover available free providers based on environment.
   */
  async autoDiscover(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    for (const endpoint of FREE_ENDPOINTS) {
      if (this.endpoints.has(endpoint.id)) continue;

      if (!endpoint.requiresKey) {
        // No-key endpoints (like Ollama) - register and health check
        const provider = this.createProvider(endpoint);
        this.registerEndpoint(endpoint.id, provider);
        continue;
      }

      // Key-required endpoints - check if key is available
      const key = endpoint.envKey ? process.env[endpoint.envKey] : undefined;
      if (key) {
        const provider = this.createProvider(endpoint, key);
        this.registerEndpoint(endpoint.id, provider);
      }
    }
  }

  private createProvider(endpoint: FreeModelEndpoint, apiKey?: string): LLMProvider {
    return new OpenAICompatibleProvider({
      name: endpoint.id,
      baseUrl: endpoint.baseUrl,
      apiKey,
      defaultModel: endpoint.defaultModel,
      timeout: 30000,
    }) as unknown as LLMProvider;
  }

  private rebuildFallbackOrder(): void {
    this.fallbackOrder = Array.from(this.endpoints.entries())
      .sort(([, a], [, b]) => a.info.priority - b.info.priority)
      .map(([id]) => id);
  }

  private isOnCooldown(id: string): boolean {
    const until = this.cooldowns.get(id);
    if (!until) return false;
    if (Date.now() >= until) {
      this.cooldowns.delete(id);
      return false;
    }
    return true;
  }

  private recordFailure(id: string): void {
    const current = this.cooldowns.get(id) ?? Date.now();
    const backoff = Math.max(5000, (current - Date.now()) * 2);
    this.cooldowns.set(id, Date.now() + Math.min(backoff, 300_000));
  }

  private resolveModel(request: CompletionRequest): { endpointId: string; modelName: string } {
    let modelName = request.model || this.activeModel || this.pickBestModel();

    // Check aliases
    if (MODEL_ALIASES[modelName] !== undefined) {
      const resolved = MODEL_ALIASES[modelName]!;
      modelName = resolved || this.pickBestModel();
    }

    // Find which endpoint has this model
    for (const [id, { info }] of this.endpoints) {
      if (info.models.includes(modelName)) {
        return { endpointId: id, modelName };
      }
      if (modelName.startsWith(`${id}/`)) {
        return { endpointId: id, modelName: modelName.slice(id.length + 1) };
      }
    }

    // Fall back to first available endpoint
    const firstId = this.fallbackOrder[0] || this.endpoints.keys().next().value;
    if (firstId) {
      const info = this.endpoints.get(firstId)?.info;
      return { endpointId: firstId, modelName: info?.defaultModel ?? modelName };
    }

    throw LlmError.unavailable(
      'No free providers available. ' +
      'Start Ollama locally with `ollama serve`, or set one of: ' +
      'GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY for free tier access.',
    );
  }

  override async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.ensureInitialized();
    let lastError: LlmError | null = null;
    const { endpointId: initialEndpoint, modelName } = this.resolveModel(request);

    // Try the resolved endpoint first, then fallback through the chain
    const tryOrder = [initialEndpoint, ...this.fallbackOrder.filter((id) => id !== initialEndpoint)];

    for (const endpointId of tryOrder) {
      if (this.isOnCooldown(endpointId)) continue;

      const entry = this.endpoints.get(endpointId);
      if (!entry) continue;

      try {
        const result = await entry.provider.complete({
          ...request,
          model: modelName,
        });

        return result;
      } catch (err) {
        if (err instanceof LlmError) {
          if (err.isRateLimit() || err.isTransient()) {
            this.recordFailure(endpointId);
            lastError = err;
            continue;
          }
          // Re-throw non-transient errors
          throw err;
        }
        throw err;
      }
    }

    throw lastError ?? LlmError.unavailable(
      'All free models exhausted. Check your API keys or try again later.',
    );
  }

  override async streamComplete(
    request: CompletionRequest,
    onEvent: StreamCallback,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<void> {
    this.ensureInitialized();
    let lastError: LlmError | null = null;
    const { endpointId: initialEndpoint, modelName } = this.resolveModel(request);

    const tryOrder = [initialEndpoint, ...this.fallbackOrder.filter((id) => id !== initialEndpoint)];

    for (const endpointId of tryOrder) {
      if (this.isOnCooldown(endpointId)) continue;

      const entry = this.endpoints.get(endpointId);
      if (!entry) continue;

      try {
        await entry.provider.streamComplete(
          {
            ...request,
            model: modelName,
          },
          onEvent,
          options
        );

        return;
      } catch (err) {
        if (err instanceof LlmError) {
          if (err.isRateLimit() || err.isTransient()) {
            this.recordFailure(endpointId);
            lastError = err;
            continue;
          }
          throw err;
        }
        throw err;
      }
    }

    throw lastError ?? LlmError.unavailable(
      'All free models exhausted. Check your API keys or try again later.',
    );
  }

  async checkHealth(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    for (const [id, { provider }] of this.endpoints) {
      const cached = this.healthCache.get(id);
      if (cached && Date.now() - cached.time < 30_000) {
        results.set(id, cached.result);
        continue;
      }
      try {
        const testRequest: CompletionRequest = {
          model: 'test',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [],
          maxTokens: 1,
          stream: false,
        };
        const start = Date.now();
        await provider.complete(testRequest);
        const result: HealthCheckResult = { available: true, latencyMs: Date.now() - start };
        this.healthCache.set(id, { result, time: Date.now() });
        results.set(id, result);
      } catch (err) {
        const result: HealthCheckResult = {
          available: false,
          error: err instanceof Error ? err.message : String(err),
        };
        this.healthCache.set(id, { result, time: Date.now() });
        results.set(id, result);
      }
    }
    return results;
  }

  getEndpoints(): string[] {
    return Array.from(this.endpoints.keys());
  }

  hasEndpoints(): boolean {
    return this.endpoints.size > 0;
  }

  getAliases(): Record<string, string> {
    return { ...MODEL_ALIASES };
  }
}
