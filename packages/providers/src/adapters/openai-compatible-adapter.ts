import { LlmError } from '../base.js';
import type { StreamCallback, HealthStatus, ModelInfo } from '../base.js';
import { HttpClient } from '../http-client.js';
import { ConnectionPool } from '../connection-pool.js';
import { withRetry } from '../retry.js';
import { AuthManager } from '../auth-manager.js';
import type { ProviderAdapter } from '../types/adapter.js';
import type { ProviderConfig, AuthType, Capability } from '../types/provider-descriptor.js';
import type { CompletionRequest, CompletionResponse, TokenUsage } from 'librecode-types';

interface OpenAiMessage {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface OpenAiChoice {
  message: OpenAiMessage;
  finish_reason?: string;
}

interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAiResponse {
  choices: OpenAiChoice[];
  usage?: OpenAiUsage;
}

interface OpenAiStreamDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface OpenAiStreamChoice {
  delta: OpenAiStreamDelta;
  finish_reason?: string;
}

interface OpenAiStreamChunk {
  choices: OpenAiStreamChoice[];
  usage?: OpenAiUsage;
}

function convertMessages(messages: CompletionRequest['messages']): OpenAiMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    tool_call_id: m.tool_call_id,
    tool_calls: m.tool_calls as OpenAiMessage['tool_calls'],
  }));
}

export interface OpenAICompatibleAdapterOptions {
  providerId: string;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;
  authType: AuthType;
  capabilities: Capability[];
  organization?: string;
  project?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  contextWindow?: number;
  chatPath?: string;
  modelsPath?: string;
  connectionPool?: ConnectionPool;
  authManager?: AuthManager;
}

const DEFAULT_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-3-5': 200_000,
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.0-flash-lite': 1_048_576,
  'codellama': 32_768,
  'llama3.2': 128_000,
  'llama-3.1-8b': 128_000,
  'mistral': 32_768,
};

function estimateContextWindow(model: string): number {
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(DEFAULT_CONTEXT_WINDOWS)) {
    if (lower.includes(key)) return value;
  }
  return 128_000;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly providerId: string;
  private httpClient: HttpClient;
  private defaultModel: string;
  private contextWindow: number;
  private chatPath: string;
  private modelsPath: string;
  private capabilities: Set<Capability>;
  private authType: AuthType;

  constructor(options: OpenAICompatibleAdapterOptions) {
    this.providerId = options.providerId;
    this.defaultModel = options.defaultModel;
    this.chatPath = options.chatPath ?? '/chat/completions';
    this.modelsPath = options.modelsPath ?? '/models';
    this.capabilities = new Set(options.capabilities);
    this.authType = options.authType;
    this.contextWindow = options.contextWindow ?? estimateContextWindow(this.defaultModel);

    let cleanBaseUrl = options.baseUrl.replace(/\/$/, '');
    if (cleanBaseUrl.endsWith('/chat/completions')) {
      cleanBaseUrl = cleanBaseUrl.slice(0, -'/chat/completions'.length).replace(/\/$/, '');
    } else if (cleanBaseUrl.endsWith('/models')) {
      cleanBaseUrl = cleanBaseUrl.slice(0, -'/models'.length).replace(/\/$/, '');
    }

    const authManager = options.authManager ?? new AuthManager();

    const resolvedHeaders: Record<string, string> = {
      ...options.customHeaders,
      'Content-Type': 'application/json',
    };

    const authHeaders = authManager.getAuthHeadersSync(this.providerId, this.authType, { apiKey: options.apiKey });
    Object.assign(resolvedHeaders, authHeaders);

    if (options.organization) {
      resolvedHeaders['OpenAI-Organization'] = options.organization;
    }
    if (options.project) {
      resolvedHeaders['OpenAI-Project'] = options.project;
    }

    this.httpClient = new HttpClient({
      baseUrl: cleanBaseUrl,
      apiKey: options.apiKey,
      organization: options.organization,
      project: options.project,
      customHeaders: resolvedHeaders,
      timeout: options.timeout ?? 30000,
      maxRetries: 3,
      retryDelay: 1000,
      name: this.providerId,
    });
  }

  private hasCap(cap: Capability): boolean {
    return this.capabilities.has(cap);
  }

  async initialize(_config: ProviderConfig): Promise<void> {
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const result = await this.httpClient.request('GET', this.modelsPath);
      if (result.status !== 200) return [this.getDefaultModelInfo()];

      const raw = JSON.parse(result.body as string);
      let models: Array<{ id: string; name?: string }> = [];
      if (Array.isArray(raw)) {
        models = raw;
      } else if (raw.data && Array.isArray(raw.data)) {
        models = raw.data;
      }

      if (models.length === 0) return [this.getDefaultModelInfo()];

      return models.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        provider: this.providerId,
        contextWindow: this.contextWindow,
        supportsToolCalling: this.hasCap('tools'),
        supportsStreaming: this.hasCap('streaming'),
        isFree: false,
      }));
    } catch {
      return [this.getDefaultModelInfo()];
    }
  }

  async health(): Promise<HealthStatus> {
    try {
      const result = await this.httpClient.request('POST', this.chatPath, {
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      });
      return {
        status: result.status === 200 ? 'healthy' : 'unhealthy',
        message: result.status === 200 ? `${this.providerId} available` : `HTTP ${result.status}`,
      };
    } catch (err) {
      return { status: 'unhealthy', message: err instanceof Error ? err.message : String(err) };
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages: convertMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false,
    };

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
    }

    const result = await this.httpClient.request('POST', this.chatPath, body);
    if (result.status !== 200) {
      throw this.handleError(result.status, result.body as string);
    }

    const resp = JSON.parse(result.body as string) as OpenAiResponse;
    const choice = resp.choices[0];
    if (!choice) {
      throw LlmError.apiError(`${this.providerId}: No choices in response`);
    }

    const finishReason = this.parseFinishReason(choice.finish_reason);
    const toolCalls = choice.message.tool_calls ?? [];
    const usage = resp.usage
      ? {
          promptTokens: resp.usage.prompt_tokens,
          completionTokens: resp.usage.completion_tokens,
          totalTokens: resp.usage.total_tokens,
        }
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    return {
      content: choice.message.content ?? null,
      toolCalls: toolCalls as CompletionResponse['toolCalls'],
      usage,
      finishReason,
    };
  }

  async streamComplete(request: CompletionRequest, onEvent: StreamCallback): Promise<void> {
    const body: Record<string, unknown> = {
      model: request.model || this.defaultModel,
      messages: convertMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
    }

    const result = await this.httpClient.request('POST', this.chatPath, body, true);
    if (result.status !== 200) {
      throw this.handleError(result.status, result.body as string);
    }

    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let hasAnyEvent = false;

    const responseBody = result.body;
    if (!responseBody) {
      throw LlmError.networkError('No response body');
    }

    const reader = (responseBody as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
        }

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        while (buffer.includes('\n')) {
          const newlinePos = buffer.indexOf('\n');
          const line = buffer.slice(0, newlinePos).trim();
          buffer = buffer.slice(newlinePos + 1);

          if (!line || line.startsWith(':')) continue;

          const dataPrefix = 'data: ';
          if (!line.startsWith(dataPrefix)) continue;

          const data = line.slice(dataPrefix.length).trim();
          if (data === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const chunk = JSON.parse(data) as OpenAiStreamChunk;

            if ('error' in chunk) {
              const errChunk = chunk as unknown as { error: { message?: string } };
              throw LlmError.apiError(
                `${this.providerId}: streaming error - ${errChunk.error?.message ?? JSON.stringify(errChunk.error)}`,
              );
            }

            if (chunk.usage) {
              usage = {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              };
            }

            const choice = chunk.choices?.[0];
            if (choice) {
              if (choice.delta.content) {
                hasAnyEvent = true;
                onEvent({ type: 'text_delta', delta: choice.delta.content });
              }

              if (choice.delta.tool_calls) {
                hasAnyEvent = true;
                for (const tc of choice.delta.tool_calls) {
                  onEvent({
                    type: 'tool_call_delta',
                    index: tc.index,
                    id: tc.id,
                    name: tc.function?.name,
                    argumentsDelta: tc.function?.arguments ?? '',
                  });
                }
              }

              if (choice.finish_reason === 'content_filter') {
                onEvent({ type: 'error', message: 'Content filtered by provider safety system.' });
              }
            }
          } catch (err) {
            if (err instanceof LlmError) throw err;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!hasAnyEvent) {
      throw LlmError.apiError(`${this.providerId}: Empty streaming response received`);
    }

    onEvent({ type: 'done', usage });
  }

  private parseFinishReason(reason?: string): string {
    switch (reason) {
      case 'stop': return 'stop';
      case 'tool_calls':
      case 'function_call': return 'tool_calls';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      default: return reason ?? 'stop';
    }
  }

  private handleError(status: number, text: string): LlmError {
    const msg = text.slice(0, 200);
    switch (status) {
      case 401:
      case 403:
        return LlmError.authError(
          msg.includes('Invalid API key')
            ? msg
            : `Invalid API key for ${this.providerId}. Check your API key and try again.`,
        );
      case 404: {
        const lower = msg.toLowerCase();
        if (lower.includes('model not found')) {
          return LlmError.modelNotFound(
            `Model '${this.defaultModel}' not found for ${this.providerId}. Run \`librecode provider models ${this.providerId}\` to list available models.`,
          );
        }
        return LlmError.apiError(`Endpoint not found (HTTP 404). Check the base URL for ${this.providerId}.`, status);
      }
      case 429:
        return LlmError.rateLimited();
      case 400:
        if (msg.includes('context_length') || msg.includes('context window')) {
          return LlmError.contextExceeded(0);
        }
        return LlmError.apiError(`${this.providerId}: ${msg}`, status);
      default:
        return LlmError.apiError(`${this.providerId}: ${msg}`, status);
    }
  }

  private getDefaultModelInfo(): ModelInfo {
    return {
      id: this.defaultModel,
      name: this.defaultModel,
      provider: this.providerId,
      contextWindow: this.contextWindow,
      supportsToolCalling: this.hasCap('tools'),
      supportsStreaming: this.hasCap('streaming'),
      isFree: false,
    };
  }
}
