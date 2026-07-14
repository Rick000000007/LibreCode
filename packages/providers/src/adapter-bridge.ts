import type { LLMProvider, ModelInfo, StreamCallback } from './base.js';
import { BaseProvider, LlmError } from './base.js';
import type { CompletionRequest, CompletionResponse } from 'librecode-types';
import type { ProviderAdapter } from './types/adapter.js';
import type { Capability } from './types/provider-descriptor.js';

export class AdapterBridge extends BaseProvider {
  private adapter: ProviderAdapter;
  private providerId: string;
  private _caps: Set<Capability>;

  constructor(adapter: ProviderAdapter, defaultModel: string, capabilities: Capability[]) {
    super();
    this.adapter = adapter;
    this.providerId = adapter.providerId;
    this._caps = new Set(capabilities);
    if (defaultModel) {
      this.setModel(defaultModel);
    }
  }

  override name(): string {
    return this.providerId;
  }

  override maxContextWindow(): number {
    return 128_000;
  }

  private hasCap(cap: Capability): boolean {
    return this._caps.has(cap);
  }

  override supportsStreaming(): boolean {
    return this.hasCap('streaming');
  }

  override supportsToolCalling(): boolean {
    return this.hasCap('tools') || this.hasCap('function-calling');
  }

  override supportsVision(): boolean {
    return this.hasCap('vision');
  }

  override supportsReasoning(): boolean {
    return this.hasCap('structured-output');
  }

  override supportsThinking(): boolean {
    return this.hasCap('structured-output');
  }

  override supportsMCP(): boolean {
    return false;
  }

  private storedModel: string = '';

  override setModel(modelId: string): void {
    this.storedModel = modelId;
    super.setModel(modelId);
  }

  override getModel(): ModelInfo {
    const modelId = this.storedModel || 'unknown';
    return {
      id: modelId,
      name: modelId,
      provider: this.providerId,
      contextWindow: this.maxContextWindow(),
      supportsToolCalling: this.supportsToolCalling(),
      supportsStreaming: this.supportsStreaming(),
      isFree: false,
    };
  }



  getAdapter(): ProviderAdapter {
    return this.adapter;
  }

  override async complete(
    request: CompletionRequest,
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<CompletionResponse> {
    return this.adapter.complete(request);
  }

  override async streamComplete(
    request: CompletionRequest,
    onEvent: StreamCallback,
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<void> {
    return this.adapter.streamComplete(request, (event) => {
      if (event.type === 'text_delta' || event.type === 'tool_call_delta' || event.type === 'done' || event.type === 'error') {
        onEvent(event);
      }
    });
  }

  override async listModels(): Promise<ModelInfo[]> {
    return this.adapter.listModels();
  }

  override async health(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> {
    return this.adapter.health();
  }

  override async embeddings(text: string, options?: { signal?: AbortSignal }): Promise<number[]> {
    throw LlmError.apiError(`Embeddings not supported by ${this.providerId}`);
  }
}
