/* eslint-disable no-constant-condition */
import { BaseProvider, LlmError } from './index.js';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  TokenUsage,
  ToolCall,
  Message,
} from 'librecode-types';

interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface OpenAiMessage {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
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
  tool_calls?: OpenAiStreamToolCall[];
}

interface OpenAiStreamChoice {
  delta: OpenAiStreamDelta;
  finish_reason?: string;
}

interface OpenAiStreamChunk {
  choices: OpenAiStreamChoice[];
  usage?: OpenAiUsage;
}

interface OpenAiStreamToolCall {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

function convertMessages(messages: Message[]): OpenAiMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    tool_call_id: m.tool_call_id,
    tool_calls: m.tool_calls,
  }));
}

export class OpenAIProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: ProviderOptions) {
    super();
    this.apiKey = options.apiKey ?? '';
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.defaultModel = options.defaultModel ?? 'gpt-4o';
  }

  override name(): string {
    return 'openai';
  }

  override maxContextWindow(): number {
    switch (this.defaultModel) {
      case 'gpt-4o':
      case 'gpt-4o-mini':
      case 'gpt-4-turbo':
        return 128_000;
      case 'gpt-4':
        return 8_192;
      case 'gpt-3.5-turbo':
        return 16_385;
      default:
        return 128_000;
    }
  }

  override supportsStreaming(): boolean {
    return true;
  }

  private handleError(status: number, text: string): LlmError {
    try {
      const body = JSON.parse(text) as { error?: { message?: string; type?: string } };
      const msg = body.error?.message ?? text;
      switch (status) {
        case 429:
          return LlmError.rateLimited();
        case 401:
          return LlmError.authError(msg);
        case 404:
          return LlmError.modelNotFound(msg);
        default:
          return LlmError.apiError(msg, status);
      }
    } catch {
      return LlmError.apiError(`HTTP ${status}: ${text}`, status);
    }
  }

  override async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw LlmError.authError('OpenAI API key not set');
    }

    const body = {
      model: request.model,
      messages: convertMessages(request.messages),
      tools: (request.tools ?? []).length > 0 ? request.tools : undefined,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false,
    };

    const url = `${this.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      throw this.handleError(response.status, text);
    }

    const resp = JSON.parse(text) as OpenAiResponse;
    const choice = resp.choices[0];
    if (!choice) {
      throw LlmError.apiError('No choices in response');
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
      toolCalls,
      usage,
      finishReason,
    };
  }

  override async streamComplete(request: CompletionRequest): Promise<StreamEvent[]> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw LlmError.authError('OpenAI API key not set');
    }

    const body = {
      model: request.model,
      messages: convertMessages(request.messages),
      tools: (request.tools ?? []).length > 0 ? request.tools : undefined,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    };

    const url = `${this.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw this.handleError(response.status, text);
    }

    const events: StreamEvent[] = [];
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    if (!response.body) {
      throw LlmError.networkError('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      let streamDone = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (streamDone) break;
          streamDone = true;
        }

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        while (true) {
          const newlinePos = buffer.indexOf('\n');
          if (newlinePos === -1) break;

          const line = buffer.slice(0, newlinePos).trim();
          buffer = buffer.slice(newlinePos + 1);

          if (!line || line.startsWith(':')) continue;

          const dataPrefix = 'data: ';
          if (!line.startsWith(dataPrefix)) continue;

          const data = line.slice(dataPrefix.length).trim();
          if (data === '[DONE]') break;

          try {
            const chunk = JSON.parse(data) as OpenAiStreamChunk;

            if (chunk.usage) {
              usage = {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              };
            }

            const choice = chunk.choices[0];
            if (choice) {
              if (choice.delta.content) {
                events.push({ type: 'text_delta', delta: choice.delta.content });
              }

              if (choice.delta.tool_calls) {
                for (const tc of choice.delta.tool_calls) {
                  events.push({
                    type: 'tool_call_delta',
                    index: tc.index,
                    id: tc.id,
                    name: tc.function?.name,
                    argumentsDelta: tc.function?.arguments ?? '',
                  });
                }
              }
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }

        if (streamDone) break;
      }
    } finally {
      reader.releaseLock();
    }

    events.push({ type: 'done', usage });
    return events;
  }

  private parseFinishReason(reason?: string): string {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return reason ?? 'stop';
    }
  }
}
