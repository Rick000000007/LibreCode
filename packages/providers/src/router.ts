import { BaseProvider, LlmError } from './base.js';
import type { LLMProvider, StreamCallback } from './base.js';
import type {
  CompletionRequest,
  CompletionResponse,
} from 'librecode-types';

interface CooldownEntry {
  until: number;
}

export class ModelRouter extends BaseProvider {
  private providers: Map<string, LLMProvider>;
  private failoverChain: string[];
  private cooldowns: Map<string, CooldownEntry>;

  constructor(providers: Map<string, LLMProvider>, failoverChain: string[]) {
    super();
    this.providers = providers;
    this.failoverChain = failoverChain;
    this.cooldowns = new Map();
  }

  override name(): string {
    return 'router';
  }

  override maxContextWindow(): number {
    let max = 128_000;
    for (const p of this.providers.values()) {
      max = Math.max(max, p.maxContextWindow());
    }
    return max;
  }

  override supportsStreaming(): boolean {
    for (const p of this.providers.values()) {
      if (p.supportsStreaming()) return true;
    }
    return false;
  }

  resolveProvider(modelId: string): LLMProvider {
    const provider = this.providers.get(modelId);
    if (!provider) {
      throw LlmError.unavailable(`No provider for model: ${modelId}`);
    }
    return provider;
  }

  private isCoolingDown(modelId: string): boolean {
    const entry = this.cooldowns.get(modelId);
    if (!entry) return false;
    if (Date.now() < entry.until) return true;
    this.cooldowns.delete(modelId);
    return false;
  }

  private startCooldown(modelId: string): void {
    this.cooldowns.set(modelId, {
      until: Date.now() + 60_000,
    });
  }

  override async complete(
    request: CompletionRequest,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<CompletionResponse> {
    let lastError: LlmError | null = null;

    for (const modelId of this.failoverChain) {
      if (this.isCoolingDown(modelId)) continue;

      try {
        const provider = this.resolveProvider(modelId);
        return await provider.complete({ ...request }, options);
      } catch (err) {
        if (err instanceof LlmError) {
          if (err.isRateLimit()) {
            this.startCooldown(modelId);
            lastError = err;
          } else if (err.isTransient()) {
            lastError = err;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    throw lastError ?? LlmError.unavailable('All providers exhausted');
  }

  override async streamComplete(
    request: CompletionRequest,
    onEvent: StreamCallback,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<void> {
    let lastError: LlmError | null = null;

    for (const modelId of this.failoverChain) {
      if (this.isCoolingDown(modelId)) continue;

      try {
        const provider = this.resolveProvider(modelId);
        await provider.streamComplete({ ...request }, onEvent, options);
        return;
      } catch (err) {
        if (err instanceof LlmError) {
          if (err.isRateLimit()) {
            this.startCooldown(modelId);
            lastError = err;
          } else if (err.isTransient()) {
            lastError = err;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    throw lastError ?? LlmError.unavailable('All providers exhausted');
  }

  override async embeddings(text: string, options?: { signal?: AbortSignal }): Promise<number[]> {
    let lastError: LlmError | null = null;

    for (const modelId of this.failoverChain) {
      if (this.isCoolingDown(modelId)) continue;

      try {
        const provider = this.resolveProvider(modelId);
        return await provider.embeddings(text, options);
      } catch (err) {
        if (err instanceof LlmError) {
          if (err.isRateLimit()) {
            this.startCooldown(modelId);
            lastError = err;
          } else if (err.isTransient()) {
            lastError = err;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    throw lastError ?? LlmError.unavailable('All providers exhausted');
  }
}
