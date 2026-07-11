import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  TokenUsage,
} from 'librecode-types';

export type BoxFuture<T> = Promise<T>;

export interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest): Promise<StreamEvent[]>;
  name(): string;
  maxContextWindow(): number;
  supportsToolCalling(): boolean;
  supportsStreaming(): boolean;
}

export abstract class BaseProvider implements LLMProvider {
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract streamComplete(request: CompletionRequest): Promise<StreamEvent[]>;
  abstract name(): string;
  abstract maxContextWindow(): number;

  supportsToolCalling(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return false;
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
