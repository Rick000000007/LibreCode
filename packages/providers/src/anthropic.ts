/* eslint-disable no-constant-condition */
import { BaseProvider, LlmError, createUsage, type StreamCallback } from './base.js';
import type {
  CompletionRequest,
  CompletionResponse,
  ToolCall,
  Message,
} from 'librecode-types';

interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: 'content_block_delta' | 'content_block_start' | 'message_delta';
  index?: number;
  delta?: {
    text?: string;
    partial_json?: string;
  };
  content_block?: {
    id: string;
    name: string;
    type: 'tool_use' | 'text';
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

function convertMessages(messages: Message[]): {
  system?: string;
  converted: { role: 'user' | 'assistant'; content: string }[];
} {
  let system: string | undefined;
  const converted: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      system = m.content ?? '';
    } else if (m.role === 'user' || m.role === 'assistant') {
      converted.push({
        role: m.role,
        content: m.content ?? '',
      });
    }
  }

  return { system, converted };
}

function convertTools(tools: any[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? '',
    input_schema: {
      type: 'object',
      properties: t.function.parameters.properties ?? {},
      required: t.function.parameters.required ?? [],
    },
  }));
}

export class AnthropicProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: ProviderOptions) {
    super();
    this.apiKey = options.apiKey ?? '';
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
    this.defaultModel = options.defaultModel ?? 'claude-3-opus-20240229';
  }

  override name(): string {
    return 'anthropic';
  }

  override maxContextWindow(): number {
    return 200_000;
  }

  override supportsStreaming(): boolean {
    return true;
  }

  private handleError(status: number, text: string): LlmError {
    try {
      const body = JSON.parse(text) as { error?: { message?: string } };
      const msg = body.error?.message ?? text;
      switch (status) {
        case 429:
          return LlmError.rateLimited();
        case 401:
          return LlmError.authError(msg);
        default:
          return LlmError.apiError(msg, status);
      }
    } catch {
      return LlmError.apiError(`HTTP ${status}: ${text}`, status);
    }
  }

  override async complete(
    request: CompletionRequest,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<CompletionResponse> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw LlmError.authError('Anthropic API key not set');
    }

    const { system, converted } = convertMessages(request.messages);
    const tools =
      request.tools.length > 0 ? convertTools(request.tools) : undefined;

    const bodyJson: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: converted,
      temperature: request.temperature,
      stream: false,
    };
    if (system) {
      bodyJson['system'] = system;
    }
    if (tools) {
      bodyJson['tools'] = tools;
    }

    const url = `${this.baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyJson),
      signal: options?.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw this.handleError(response.status, text);
    }

    const resp = JSON.parse(text) as AnthropicResponse;
    let contentText = '';
    const toolCalls: ToolCall[] = [];

    for (const block of resp.content) {
      if (block.type === 'text' && block.text) {
        contentText += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id ?? '',
          type: 'function',
          function: {
            name: block.name ?? '',
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      }
    }

    const finishReason = this.parseFinishReason(resp.stop_reason);
    const usage = resp.usage
      ? createUsage({
          promptTokens: resp.usage.input_tokens,
          completionTokens: resp.usage.output_tokens,
          totalTokens: resp.usage.input_tokens + resp.usage.output_tokens,
        })
      : createUsage({});

    return {
      content: contentText || null,
      toolCalls,
      usage,
      finishReason,
    };
  }

  override async streamComplete(
    request: CompletionRequest,
    onEvent: StreamCallback,
    options?: { signal?: AbortSignal; timeout?: number }
  ): Promise<void> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw LlmError.authError('Anthropic API key not set');
    }

    const { system, converted } = convertMessages(request.messages);
    const tools =
      request.tools.length > 0 ? convertTools(request.tools) : undefined;

    const bodyJson: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: converted,
      temperature: request.temperature,
      stream: true,
    };
    if (system) {
      bodyJson['system'] = system;
    }
    if (tools) {
      bodyJson['tools'] = tools;
    }

    const url = `${this.baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyJson),
      signal: options?.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw this.handleError(response.status, text);
    }

    let usage = createUsage({});

    if (!response.body) {
      throw LlmError.networkError('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (options?.signal?.aborted) {
          throw new Error('Streaming aborted');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const newlinePos = buffer.indexOf('\n');
          if (newlinePos === -1) break;

          const line = buffer.slice(0, newlinePos).trim();
          buffer = buffer.slice(newlinePos + 1);

          if (!line) continue;

          const dataPrefix = 'data: ';
          if (!line.startsWith(dataPrefix)) continue;

          const data = line.slice(dataPrefix.length).trim();

          try {
            const event = JSON.parse(data) as AnthropicStreamEvent;

            switch (event.type) {
              case 'content_block_delta':
                if (event.delta?.text) {
                  onEvent({ type: 'text_delta', delta: event.delta.text });
                }
                if (event.delta?.partial_json) {
                  onEvent({
                    type: 'tool_call_delta',
                    index: event.index ?? 0,
                    argumentsDelta: event.delta.partial_json,
                  });
                }
                break;
              case 'content_block_start':
                if (
                  event.content_block &&
                  event.content_block.type === 'tool_use'
                ) {
                  onEvent({
                    type: 'tool_call_delta',
                    index: event.index ?? 0,
                    id: event.content_block.id,
                    name: event.content_block.name,
                    argumentsDelta: '',
                  });
                }
                break;
              case 'message_delta':
                if (event.usage) {
                  usage = {
                    promptTokens: event.usage.input_tokens,
                    completionTokens: event.usage.output_tokens,
                    totalTokens:
                      event.usage.input_tokens + event.usage.output_tokens,
                  };
                }
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    onEvent({ type: 'done', usage });
  }

  private parseFinishReason(reason?: string): string {
    switch (reason) {
      case 'end_turn':
      case 'stop':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      case 'max_tokens':
        return 'length';
      default:
        return reason ?? 'stop';
    }
  }
}
