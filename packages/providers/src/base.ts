import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  TokenUsage,
} from 'librecode-types';

export type BoxFuture<T> = Promise<T>;

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  isFree: boolean;
  /** Model category for alias selection */
  category?: 'fast' | 'reasoning' | 'balanced' | 'small' | 'code';
}

export interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest): Promise<StreamEvent[]>;
  name(): string;
  maxContextWindow(): number;
  supportsToolCalling(): boolean;
  supportsStreaming(): boolean;
  /** List available models for this provider */
  listModels(): Promise<ModelInfo[]>;
  /** Whether this provider supports vision/image inputs */
  supportsVision(): boolean;
  /** Whether this provider supports extended reasoning/thinking */
  supportsReasoning(): boolean;
  /** Whether this provider supports thinking tokens (Claude-style) */
  supportsThinking(): boolean;
  /** Whether this provider supports MCP (Model Context Protocol) */
  supportsMCP(): boolean;
  /** Get current model info */
  getModel(): ModelInfo;
  /** Switch to a specific model */
  setModel(modelId: string): void;
}

export abstract class BaseProvider implements LLMProvider {
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract streamComplete(request: CompletionRequest): Promise<StreamEvent[]>;
  abstract name(): string;
  abstract maxContextWindow(): number;

  private _model: string = '';

  supportsToolCalling(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return false;
  }

  supportsVision(): boolean {
    return false;
  }

  supportsReasoning(): boolean {
    return false;
  }

  supportsThinking(): boolean {
    return false;
  }

  supportsMCP(): boolean {
    return false;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [this.getModel()];
  }

  getModel(): ModelInfo {
    return {
      id: this._model || 'unknown',
      name: this._model || 'Unknown',
      provider: this.name(),
      contextWindow: this.maxContextWindow(),
      supportsToolCalling: this.supportsToolCalling(),
      supportsStreaming: this.supportsStreaming(),
      isFree: false,
    };
  }

  setModel(modelId: string): void {
    this._model = modelId;
  }
}

export type LlmErrorCode =
  | 'api_error'
  | 'rate_limited'
  | 'network_error'
  | 'auth_error'
  | 'model_not_found'
  | 'context_window_exceeded'
  | 'unavailable';

export class LlmError extends Error {
  code: LlmErrorCode;
  statusCode?: number;

  constructor(code: LlmErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.statusCode = statusCode;
  }

  isRateLimit(): boolean {
    return this.code === 'rate_limited';
  }

  isTransient(): boolean {
    return (
      this.code === 'rate_limited' ||
      this.code === 'network_error' ||
      this.code === 'unavailable'
    );
  }

  static apiError(msg: string, status?: number): LlmError {
    return new LlmError('api_error', msg, status);
  }

  static rateLimited(): LlmError {
    return new LlmError('rate_limited', 'Rate limited');
  }

  static authError(msg: string): LlmError {
    return new LlmError('auth_error', msg);
  }

  static modelNotFound(msg: string): LlmError {
    return new LlmError('model_not_found', msg);
  }

  static contextExceeded(tokens: number): LlmError {
    return new LlmError(
      'context_window_exceeded',
      `Context window exceeded: ${tokens} tokens`,
    );
  }

  static unavailable(msg: string): LlmError {
    return new LlmError('unavailable', msg);
  }

  static networkError(msg: string): LlmError {
    return new LlmError('network_error', msg);
  }
}

export function createUsage(data: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): TokenUsage {
  return {
    promptTokens: data.promptTokens ?? 0,
    completionTokens: data.completionTokens ?? 0,
    totalTokens: data.totalTokens ?? 0,
  };
}
