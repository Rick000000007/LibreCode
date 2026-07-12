import type { LLMProvider } from './base.js';
import type { CompletionRequest, TokenUsage } from 'librecode-types';

export interface UnifiedStreamEvent {
  type: 'text_delta' | 'reasoning_delta' | 'tool_call_delta' | 'done' | 'error' | 'provider_switch' | 'status';
  delta?: string;
  index?: number;
  id?: string;
  name?: string;
  argumentsDelta?: string;
  usage?: TokenUsage;
  message?: string;
  from?: string;
  to?: string;
  reason?: string;
}

export type StreamCallback = (event: UnifiedStreamEvent) => void;

export interface StreamController {
  cancel(): void;
  abort(): void;
  readonly cancelled: boolean;
}

export class StreamingEngine {
  private activeControllers: Set<StreamController> = new Set();
  private currentProviderId: string | null = null;

  get activeProvider(): string | null {
    return this.currentProviderId;
  }

  setActiveProvider(id: string): void {
    this.currentProviderId = id;
  }

  async streamComplete(
    provider: LLMProvider,
    providerId: string,
    request: CompletionRequest,
    onEvent: StreamCallback,
  ): Promise<StreamController> {
    const abortCtrl = new AbortController();
    const controller = this.createController(abortCtrl);
    this.activeControllers.add(controller);

    const previousProvider = this.currentProviderId;
    this.currentProviderId = providerId;

    // Signal provider switch if different from previous
    if (previousProvider && previousProvider !== providerId) {
      onEvent({
        type: 'provider_switch',
        from: previousProvider,
        to: providerId,
        reason: 'routing change',
      });
    }

    // Run the stream — fire-and-forget so the controller is returned immediately
    this.runStream(provider, providerId, request, onEvent, controller, abortCtrl.signal)
      .catch(() => {})
      .finally(() => {
        this.activeControllers.delete(controller);
        const ctrl = controller as { _resolveCompletion?: () => void };
        ctrl._resolveCompletion?.();
      });

    return controller;
  }

  private async runStream(
    provider: LLMProvider,
    providerId: string,
    request: CompletionRequest,
    onEvent: StreamCallback,
    controller: StreamController,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      if (provider.supportsStreaming()) {
        await provider.streamComplete(
          request,
          async (event) => {
            if (controller.cancelled) return;

            switch (event.type) {
              case 'text_delta':
                onEvent({ type: 'text_delta', delta: event.delta });
                break;
              case 'tool_call_delta':
                onEvent({
                  type: 'tool_call_delta',
                  index: event.index,
                  id: event.id,
                  name: event.name,
                  argumentsDelta: event.argumentsDelta,
                });
                break;
              case 'done':
                onEvent({ type: 'done', usage: event.usage });
                break;
              case 'error':
                onEvent({ type: 'error', message: event.message });
                break;
            }
          },
          { signal }
        );
      } else {
        const response = await provider.complete(request, { signal });
        if (!controller.cancelled) {
          if (response.content) {
            onEvent({ type: 'text_delta', delta: response.content });
          }
          onEvent({ type: 'done', usage: response.usage });
        }
      }
    } catch (err) {
      if (!controller.cancelled) {
        onEvent({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async complete(
    provider: LLMProvider,
    providerId: string,
    request: CompletionRequest,
  ): Promise<{
    content: string;
    usage: TokenUsage;
    events: UnifiedStreamEvent[];
  }> {
    const events: UnifiedStreamEvent[] = [];
    const abortCtrl = new AbortController();
    const controller = this.createController(abortCtrl);

    this.setActiveProvider(providerId);

    return new Promise((resolve, reject) => {
      this.runStream(
        provider,
        providerId,
        request,
        (event) => {
          events.push(event);
          if (event.type === 'done') {
            const content = events
              .filter((e) => e.type === 'text_delta')
              .map((e) => e.delta)
              .join('');
            resolve({
              content,
              usage: event.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              events,
            });
          }
          if (event.type === 'error') {
            reject(new Error(event.message));
          }
        },
        controller,
        abortCtrl.signal
      );
    });
  }

  private createController(abortCtrl: AbortController): StreamController & { _completion: Promise<void>; _resolveCompletion: () => void } {
    let cancelled = false;
    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    return {
      cancel(): void {
        cancelled = true;
        abortCtrl.abort();
      },
      abort(): void {
        cancelled = true;
        abortCtrl.abort();
      },
      get cancelled(): boolean { return cancelled; },
      _completion: completion,
      _resolveCompletion: resolveCompletion,
    } as unknown as StreamController & { _completion: Promise<void>; _resolveCompletion: () => void };
  }

  async waitForCompletion(controller: StreamController): Promise<void> {
    const ctrl = controller as { _completion?: Promise<void> };
    if (ctrl._completion) {
      await ctrl._completion;
    }
  }

  cancelAll(): void {
    for (const ctrl of this.activeControllers) {
      ctrl.cancel();
    }
    this.activeControllers.clear();
  }
}
