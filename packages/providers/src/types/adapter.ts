import type { CompletionRequest, CompletionResponse } from 'librecode-types';
import type { StreamCallback, HealthStatus, ModelInfo } from '../base.js';
import type { ProviderConfig } from './provider-descriptor.js';

export interface ProviderAdapter {
  readonly providerId: string;
  initialize(config: ProviderConfig): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest, onEvent: StreamCallback): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  health(): Promise<HealthStatus>;
}

export interface ProviderPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  createAdapter(config: ProviderConfig): ProviderAdapter;
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] };
  getCapabilities(): string[];
}
