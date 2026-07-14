import { BaseProvider, LlmError } from './base.js';
import type { LLMProvider, StreamCallback } from './base.js';
import type {
  CompletionRequest,
  CompletionResponse,
  HealthCheckResult,
} from 'librecode-types';

interface CooldownEntry {
  until: number;
  attempts: number;
}

interface CachedHealth {
  result: HealthCheckResult;
  timestamp: number;
}

export class ProviderRouter extends BaseProvider {
  private providers: Map<string, { provider: LLMProvider; order: number }>;
  private failoverOrder: string[];
  private cooldowns: Map<string, CooldownEntry>;
  private healthCache: Map<string, CachedHealth>;
  private healthTtlMs: number;

  constructor() {
    super();
    this.providers = new Map();
    this.failoverOrder = [];
    this.cooldowns = new Map();
    this.healthCache = new Map();
    this.healthTtlMs = 30_000;
  }

  addProvider(id: string, provider: LLMProvider, order: number): void {
    this.providers.set(id, { provider, order });
    this.rebuildOrder();
  }

  removeProvider(id: string): void {
    this.providers.delete(id);
    this.cooldowns.delete(id);
    this.healthCache.delete(id);
    this.rebuildOrder();
  }

  hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private rebuildOrder(): void {
    this.failoverOrder = Array.from(this.providers.entries())
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([id]) => id);
  }

  override setModel(model: string): void {
    super.setModel(model);
    for (const { provider } of this.providers.values()) {
      provider.setModel(model);
    }
  }

  setHealthTtl(ms: number): void {
    this.healthTtlMs = ms;
  }

  clearHealthCache(): void {
    this.healthCache.clear();
  }

  async checkHealth(id: string): Promise<HealthCheckResult> {
    const cached = this.healthCache.get(id);
    if (cached && Date.now() - cached.timestamp < this.healthTtlMs) {
      return cached.result;
    }

    const entry = this.providers.get(id);
    if (!entry) {
      return { available: false, error: 'Provider not registered' };
    }

    const start = Date.now();
    try {
      const model = entry.provider.getModel().id;
      const testRequest: CompletionRequest = {
        model,
        messages: [{ role: 'user', content: 'ping' }],
        tools: [],
        maxTokens: 1,
        stream: false,
      };
      await entry.provider.complete(testRequest);
      const result: HealthCheckResult = {
        available: true,
        latencyMs: Date.now() - start,
      };
      this.healthCache.set(id, { result, timestamp: Date.now() });
      return result;
    } catch (err) {
      const result: HealthCheckResult = {
        available: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
      this.healthCache.set(id, { result, timestamp: Date.now() });
      return result;
    }
  }

  async checkAllHealth(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    const checks = Array.from(this.providers.keys()).map(async (id) => {
      results.set(id, await this.checkHealth(id));
    });
    await Promise.all(checks);
    return results;
  }

  private isCoolingDown(id: string): boolean {
    const entry = this.cooldowns.get(id);
    if (!entry) return false;
    if (Date.now() < entry.until) return true;
    this.cooldowns.delete(id);
    return false;
  }

  private recordFailure(id: string): void {
    const entry = this.cooldowns.get(id) ?? { until: 0, attempts: 0 };
    entry.attempts++;
    const backoff = Math.min(entry.attempts * 30_000, 300_000);
    entry.until = Date.now() + backoff;
    this.cooldowns.set(id, entry);
  }

  override name(): string {
    return 'router';
  }

  override maxContextWindow(): number {
    let max = 128_000;
    for (const { provider } of this.providers.values()) {
      max = Math.max(max, provider.maxContextWindow());
    }
    return max;
  }

  override supportsStreaming(): boolean {
    for (const { provider } of this.providers.values()) {
      if (provider.supportsStreaming()) return true;
    }
    return false;
  }

  private selectProvider(): string | null {
    for (const id of this.failoverOrder) {
      if (!this.isCoolingDown(id)) {
        return id;
      }
    }
    return null;
  }

  override async complete(
    request: CompletionRequest,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<CompletionResponse> {
    let lastError: LlmError | null = null;

    for (const id of this.failoverOrder) {
      if (this.isCoolingDown(id)) continue;

      const entry = this.providers.get(id);
      if (!entry) continue;

      try {
        return await entry.provider.complete({ ...request }, options);
      } catch (err) {
        if (err instanceof LlmError) {
          if (err.isRateLimit()) {
            this.recordFailure(id);
          }
          if (err.isTransient()) {
            lastError = err;
            continue;
          }
          throw err;
        }
        throw err;
      }
    }

    throw lastError ?? LlmError.unavailable(
      'All providers exhausted. Configure a provider with `librecode provider login` or check your API keys.',
    );
  }

  override async streamComplete(
    request: CompletionRequest,
    onEvent: StreamCallback,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<void> {
    let lastError: LlmError | null = null;

    for (const id of this.failoverOrder) {
      if (this.isCoolingDown(id)) continue;

      const entry = this.providers.get(id);
      if (!entry) continue;

      try {
        await entry.provider.streamComplete({ ...request }, onEvent, options);
        return;
      } catch (err) {
        if (err instanceof LlmError) {
          if (err.isRateLimit()) {
            this.recordFailure(id);
          }
          if (err.isTransient()) {
            lastError = err;
            continue;
          }
          throw err;
        }
        throw err;
      }
    }

    throw lastError ?? LlmError.unavailable(
      'All providers exhausted. Configure a provider with `librecode provider login` or check your API keys.',
    );
  }

  override async embeddings(text: string, options?: { signal?: AbortSignal }): Promise<number[]> {
    const id = this.selectProvider();
    if (!id) {
      throw LlmError.unavailable('No provider available');
    }
    const entry = this.providers.get(id);
    if (!entry) {
      throw LlmError.unavailable(`Provider not found: ${id}`);
    }
    return await entry.provider.embeddings(text, options);
  }
}

export class ProviderRouterBuilder {
  private router: ProviderRouter;

  constructor() {
    this.router = new ProviderRouter();
  }

  add(id: string, provider: LLMProvider, order: number): this {
    this.router.addProvider(id, provider, order);
    return this;
  }

  withHealthTtl(ms: number): this {
    this.router.setHealthTtl(ms);
    return this;
  }

  build(): ProviderRouter {
    return this.router;
  }
}
