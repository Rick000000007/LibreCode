export type Role = 'system' | 'user' | 'assistant' | 'tool';

export function isRole(value: string): value is Role {
  return ['system', 'user', 'assistant', 'tool'].includes(value);
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: string;
  function: FunctionCall;
}

export interface ToolDefinition {
  type: string;
  function: FunctionDefinition;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Message {
  role: Role;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export function createSystemMessage(content: string): Message {
  return { role: 'system', content };
}

export function createUserMessage(content: string): Message {
  return { role: 'user', content };
}

export function createAssistantMessage(content: string): Message {
  return { role: 'assistant', content };
}

export function createAssistantWithToolCalls(
  content: string,
  toolCalls: ToolCall[],
): Message {
  return { role: 'assistant', content, tool_calls: toolCalls };
}

export function createToolResultMessage(
  toolCallId: string,
  content: string,
): Message {
  return { role: 'tool', content, tool_call_id: toolCallId };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function createTokenUsage(
  promptTokens = 0,
  completionTokens = 0,
): TokenUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | string;

export interface CompletionRequest {
  model: string;
  messages: Message[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
}

export interface CompletionResponse {
  content: string | null;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  finishReason: FinishReason;
}

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | {
      type: 'tool_call_delta';
      index: number;
      id?: string;
      name?: string;
      argumentsDelta: string;
    }
  | { type: 'done'; usage: TokenUsage }
  | { type: 'error'; message: string };

export type AgentEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; name: string; argsPreview: string }
  | { type: 'tool_result'; name: string; success: boolean; summary: string }
  | { type: 'tool_error'; name: string; message: string }
  | { type: 'fatal_error'; message: string }
  | { type: 'turn_complete'; turnNumber: number };

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  maxTokens?: number;
  temperature?: number;
}

export function createDefaultProviderConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    defaultModel: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.0,
    ...overrides,
  };
}

export interface AgentConfig {
  provider: string;
  model: string;
  maxTurns: number;
  maxContextTokens: number;
  compactThreshold: number;
  providers: Record<string, ProviderConfig>;
}

export function createDefaultAgentConfig(): AgentConfig {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    maxTurns: 30,
    maxContextTokens: 128_000,
    compactThreshold: 0.85,
    providers: {
      openai: createDefaultProviderConfig({ defaultModel: 'gpt-4o' }),
      anthropic: createDefaultProviderConfig({
        defaultModel: 'claude-sonnet-4-20250514',
      }),
      ollama: createDefaultProviderConfig({
        baseUrl: 'http://localhost:11434',
        defaultModel: 'codellama',
      }),
    },
  };
}

export interface PermissionEntry {
  level: 'allow' | 'deny' | 'always_allow';
}

export type PermissionStore = Record<string, PermissionEntry>;

export type SafetyLevel =
  | { kind: 'safe' }
  | { kind: 'warning'; reason: string }
  | { kind: 'blocked'; reason: string };
