import type { CompletionRequest, CompletionResponse } from 'librecode-types';

export interface StreamCallback {
  (event: {
    type: string;
    delta?: string;
    index?: number;
    id?: string;
    name?: string;
    argumentsDelta?: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    message?: string;
  }): void;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  isFree: boolean;
}

export interface ProviderAdapter {
  readonly providerId: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest, onEvent: StreamCallback): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  health(): Promise<HealthStatus>;
}

export interface ProviderPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  createAdapter(config: Record<string, unknown>): ProviderAdapter;
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] };
  getCapabilities(): string[];
}
