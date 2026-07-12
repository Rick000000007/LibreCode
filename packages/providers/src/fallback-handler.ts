import type { LLMProvider } from './base.js';
import { LlmError } from './base.js';
import type { CompletionRequest, CompletionResponse } from 'librecode-types';
import { HealthMonitor } from './health-monitor.js';
import { ModelRegistry } from './model-registry.js';
import { StreamingEngine, StreamCallback } from './streaming-engine.js';
import { AutoRouter } from './auto-router.js';
import { ConversationStore } from './conversation-store.js';
import { ProviderFactory } from './provider-factory.js';

export interface FallbackOptions {
  maxRetries: number;
  maxProviderSwitches: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_OPTIONS: FallbackOptions = {
  maxRetries: 2,
  maxProviderSwitches: 2,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

export class FallbackHandler {
  private options: FallbackOptions;
  private health: HealthMonitor;
  private registry: ModelRegistry;
  private router: AutoRouter;
  private streaming: StreamingEngine;
  private conversation: ConversationStore;
  private factory: ProviderFactory;

  constructor(
    health: HealthMonitor,
    registry: ModelRegistry,
    router: AutoRouter,
    streaming: StreamingEngine,
    conversation: ConversationStore,
    factory: ProviderFactory,
    options?: Partial<FallbackOptions>,
  ) {
    this.health = health;
    this.registry = registry;
    this.router = router;
    this.streaming = streaming;
    this.conversation = conversation;
    this.factory = factory;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async executeWithFallback(
    primaryProviderId: string,
    primaryProvider: LLMProvider,
    request: CompletionRequest,
    onEvent: StreamCallback,
  ): Promise<void> {
    let lastError: Error | null = null;
    let providerSwitches = 0;
    let currentProviderId = primaryProviderId;
    let currentProvider = primaryProvider;
    let retries = 0;

    while (retries <= this.options.maxRetries && providerSwitches <= this.options.maxProviderSwitches) {
      try {
        if (currentProvider.supportsStreaming()) {
          let streamError: Error | null = null;
          const controller = await this.streaming.streamComplete(
            currentProvider,
            currentProviderId,
            this.conversation.enrichRequest(request),
            (event) => {
              if (event.type === 'error') {
                streamError = new Error(event.message);
              }
              if (event.type === 'text_delta' || event.type === 'tool_call_delta') {
                this.conversation.recordDelta(event);
              }
              onEvent(event);
            },
          );
          await this.streaming.waitForCompletion(controller);
          if (streamError) throw streamError;
        } else {
          const response = await currentProvider.complete(this.conversation.enrichRequest(request));
          const content = response.content ?? '';
          this.conversation.recordResponse(content, response.usage);
          onEvent({ type: 'text_delta', delta: content });
          onEvent({ type: 'done', usage: response.usage });
        }

        this.health.recordSuccess(currentProviderId, 0, 0);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        this.health.recordFailure(currentProviderId);

        const shouldSwitch = err instanceof LlmError
          ? (err.isRateLimit() || err.isTransient() || err.code === 'auth_error')
          : true;

        if (shouldSwitch && providerSwitches < this.options.maxProviderSwitches) {
          const nextProvider = await this.findNextProvider(currentProviderId, request);
          if (nextProvider) {
            providerSwitches++;
            currentProviderId = nextProvider.id;
            currentProvider = nextProvider.provider;
            retries = 0;

            onEvent({
              type: 'provider_switch',
              from: currentProviderId,
              to: nextProvider.id,
              reason: `fallback after error: ${lastError.message}`,
            });

            this.conversation.recordSwitch(currentProviderId, nextProvider.id);
            continue;
          }
        }

        retries++;
        if (retries <= this.options.maxRetries) {
          const delay = Math.min(
            this.options.baseDelayMs * Math.pow(2, retries - 1),
            this.options.maxDelayMs,
          );
          await this.sleep(delay);
          continue;
        }

        // Out of retries and fallbacks
        onEvent({
          type: 'error',
          message: `All providers exhausted. Last error: ${lastError.message}`,
        });
        return;
      }
    }
  }

  async executeSimple(
    provider: LLMProvider,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await provider.complete(request);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.options.maxRetries) {
          const delay = Math.min(
            this.options.baseDelayMs * Math.pow(2, attempt),
            this.options.maxDelayMs,
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Request failed after all retries');
  }

  private async findNextProvider(
    failedProviderId: string,
    _request: CompletionRequest,
  ): Promise<{ id: string; provider: LLMProvider } | null> {
    try {
      const decision = await this.router.route({ intent: 'auto' });
      if (decision.provider !== failedProviderId) {
        const provider = this.factory.create(decision.provider, { enabled: true });
        return { id: decision.provider, provider };
      }
      // Try next alternative
      for (const alt of decision.alternatives) {
        if (alt.provider !== failedProviderId) {
          const provider = this.factory.create(alt.provider, { enabled: true });
          return { id: alt.provider, provider };
        }
      }
    } catch {
      // Router failed — no fallback available
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
