/* eslint-disable no-constant-condition */
import { BaseProvider, LlmError, createUsage } from './index.js';
import type {
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ToolCall,
  Message,
} from 'librecode-types';

interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: AnthropicUsage;
}

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  content_block?: {
    type: string;
    id?: string;
    name?: string;
  };
  index?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

function convertMessages(
  messages: Message[],
): { system?: string; converted: unknown[] } {
  let system: string | undefined;
  const converted: unknown[] = [];

  for (const m of messages) {
    switch (m.role) {
      case 'system':
        system = m.content ?? undefined;
        break;
      case 'user':
        converted.push({ role: 'user', content: m.content ?? '' });
        break;
      case 'assistant': {
        const blocks: AnthropicContentBlock[] = [];
        if (m.content) {
          blocks.push({ type: 'text', text: m.content });
        }
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            } catch {
              // use empty object
            }
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }
        }
        converted.push({
          role: 'assistant',
          content:
            blocks.length === 0
              ? (m.content ?? '')
              : blocks.length === 1 && blocks[0]!.type === 'text'
                ? blocks[0]!.text ?? ''
                : blocks,
        });
        break;
      }
      case 'tool':
        converted.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content,
            },
          ],
        });
        break;
    }
  }

  return { system, converted };
}

function convertTools(
  tools: CompletionRequest['tools'],
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Record<string, unknown>,
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
    this.defaultModel = options.defaultModel ?? 'claude-sonnet-4-20250514';
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

  override async complete(request: CompletionRequest): Promise<CompletionResponse> {
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

  override async streamComplete(request: CompletionRequest): Promise<StreamEvent[]> {
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
    });

    if (!response.ok) {
      const text = await response.text();
      throw this.handleError(response.status, text);
    }

    const events: StreamEvent[] = [];
    let usage = createUsage({});

    if (!response.body) {
      throw LlmError.networkError('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
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
                  events.push({ type: 'text_delta', delta: event.delta.text });
                }
                if (event.delta?.partial_json) {
                  events.push({
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
                  events.push({
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

    events.push({ type: 'done', usage });
    return events;
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
