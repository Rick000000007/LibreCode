import { describe, it, expect } from 'vitest';
import {
  Role,
  isRole,
  FunctionCall,
  ToolCall,
  ToolDefinition,
  FunctionDefinition,
  Message,
  createSystemMessage,
  createUserMessage,
  createAssistantMessage,
  createAssistantWithToolCalls,
  createToolResultMessage,
  TokenUsage,
  createTokenUsage,
  FinishReason,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  AgentEvent,
  ProviderConfig,
  createDefaultProviderConfig,
  AgentConfig,
  createDefaultAgentConfig,
  PermissionEntry,
  PermissionStore,
  SafetyLevel,
  ProviderEntry,
  LibreConfig,
  ProviderMetadata,
  ProviderCapabilities,
  createDefaultCapabilities,
  ProviderDefinition,
  HealthCheckResult,
  ConnectionDiagnostics,
  ModelInfo,
  DoctorCheck,
  DoctorReport,
} from '../index.js';

describe('Types Package - Exported Types and Functions', () => {
  describe('Role and isRole', () => {
    it('exports Role type with correct values', () => {
      const roles: Role[] = ['system', 'user', 'assistant', 'tool'];
      expect(roles).toHaveLength(4);
    });

    it('isRole returns true for valid roles', () => {
      expect(isRole('system')).toBe(true);
      expect(isRole('user')).toBe(true);
      expect(isRole('assistant')).toBe(true);
      expect(isRole('tool')).toBe(true);
    });

    it('isRole returns false for invalid roles', () => {
      expect(isRole('invalid')).toBe(false);
      expect(isRole('')).toBe(false);
      expect(isRole('admin')).toBe(false);
    });

    it('isRole type guards correctly', () => {
      const value: string = 'user';
      if (isRole(value)) {
        expect(value).toBe('user');
      }
    });
  });

  describe('Message creation functions', () => {
    it('createSystemMessage creates correct message', () => {
      const msg = createSystemMessage('You are a helpful assistant');
      expect(msg.role).toBe('system');
      expect(msg.content).toBe('You are a helpful assistant');
    });

    it('createUserMessage creates correct message', () => {
      const msg = createUserMessage('Hello');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
    });

    it('createAssistantMessage creates correct message', () => {
      const msg = createAssistantMessage('Hi there!');
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Hi there!');
    });

    it('createAssistantWithToolCalls creates correct message', () => {
      const toolCalls = [
        { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{}' } },
      ];
      const msg = createAssistantWithToolCalls('I will read the file', toolCalls);
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('I will read the file');
      expect(msg.tool_calls).toEqual(toolCalls);
    });

    it('createToolResultMessage creates correct message', () => {
      const msg = createToolResultMessage('call_1', 'File contents...');
      expect(msg.role).toBe('tool');
      expect(msg.content).toBe('File contents...');
      expect(msg.tool_call_id).toBe('call_1');
    });
  });

  describe('TokenUsage and createTokenUsage', () => {
    it('createTokenUsage with defaults returns zeros', () => {
      const usage = createTokenUsage();
      expect(usage.promptTokens).toBe(0);
      expect(usage.completionTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
    });

    it('createTokenUsage with values computes total', () => {
      const usage = createTokenUsage(100, 50);
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
    });
  });

  describe('ProviderConfig and createDefaultProviderConfig', () => {
    it('createDefaultProviderConfig returns correct defaults', () => {
      const config = createDefaultProviderConfig();
      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.0);
    });

    it('createDefaultProviderConfig merges overrides', () => {
      const config = createDefaultProviderConfig({ defaultModel: 'gpt-3.5-turbo', temperature: 0.5 });
      expect(config.defaultModel).toBe('gpt-3.5-turbo');
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(4096);
    });
  });

  describe('AgentConfig and createDefaultAgentConfig', () => {
    it('createDefaultAgentConfig returns complete config', () => {
      const config = createDefaultAgentConfig();
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o');
      expect(config.maxTurns).toBe(30);
      expect(config.maxContextTokens).toBe(128_000);
      expect(config.compactThreshold).toBe(0.85);
      expect(config.providers).toBeDefined();
      expect(config.providers.openai).toBeDefined();
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.ollama).toBeDefined();
    });
  });

  describe('ProviderCapabilities and createDefaultCapabilities', () => {
    it('createDefaultCapabilities returns correct defaults', () => {
      const caps = createDefaultCapabilities();
      expect(caps.chatCompletions).toBe(true);
      expect(caps.responsesApi).toBe(false);
      expect(caps.streaming).toBe(true);
      expect(caps.vision).toBe(false);
      expect(caps.toolCalling).toBe(true);
      expect(caps.reasoning).toBe(false);
      expect(caps.jsonMode).toBe(false);
      expect(caps.embeddings).toBe(false);
      expect(caps.modelDiscovery).toBe(false);
    });
  });

  describe('Type exports are valid', () => {
    it('FunctionCall interface works', () => {
      const fc: FunctionCall = { name: 'test', arguments: '{}' };
      expect(fc.name).toBe('test');
    });

    it('ToolCall interface works', () => {
      const tc: ToolCall = { id: '1', type: 'function', function: { name: 'test', arguments: '{}' } };
      expect(tc.id).toBe('1');
    });

    it('ToolDefinition interface works', () => {
      const td: ToolDefinition = { type: 'function', function: { name: 'test', description: 'desc', parameters: {} } };
      expect(td.type).toBe('function');
    });

    it('Message interface works', () => {
      const msg: Message = { role: 'user', content: 'test' };
      expect(msg.role).toBe('user');
    });

    it('TokenUsage interface works', () => {
      const tu: TokenUsage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
      expect(tu.totalTokens).toBe(15);
    });

    it('StreamEvent union type works', () => {
      const events: StreamEvent[] = [
        { type: 'text_delta', delta: 'hello' },
        { type: 'tool_call_delta', index: 0, id: '1', name: 'test', argumentsDelta: '{}' },
        { type: 'done', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
        { type: 'error', message: 'oops' },
      ];
      expect(events.length).toBe(4);
    });

    it('AgentEvent union type works', () => {
      const events: AgentEvent[] = [
        { type: 'text_delta', delta: 'hello' },
        { type: 'tool_start', name: 'read_file', argsPreview: 'file.ts' },
        { type: 'tool_result', name: 'read_file', success: true, summary: 'ok' },
        { type: 'tool_error', name: 'read_file', message: 'failed' },
        { type: 'fatal_error', message: 'crash' },
        { type: 'turn_complete', turnNumber: 1 },
      ];
      expect(events.length).toBe(6);
    });

    it('SafetyLevel union type works', () => {
      const levels: SafetyLevel[] = [
        { kind: 'safe' },
        { kind: 'warning', reason: 'warn' },
        { kind: 'blocked', reason: 'blocked' },
      ];
      expect(levels.length).toBe(3);
    });

    it('HealthCheckResult interface works', () => {
      const result: HealthCheckResult = { available: true, latencyMs: 100 };
      expect(result.available).toBe(true);
    });

    it('ConnectionDiagnostics interface works', () => {
      const diag: ConnectionDiagnostics = { dnsLookup: 'ok', httpStatus: 200 };
      expect(diag.httpStatus).toBe(200);
    });

    it('ModelInfo interface works', () => {
      const mi: ModelInfo = { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, supportsToolCalling: true, supportsStreaming: true, isFree: false };
      expect(mi.id).toBe('gpt-4o');
    });

    it('DoctorCheck interface works', () => {
      const dc: DoctorCheck = { name: 'test', status: 'passed', message: 'ok' };
      expect(dc.status).toBe('passed');
    });

    it('DoctorReport interface works', () => {
      const dr: DoctorReport = { timestamp: '2024-01-01', version: '1.0', platform: 'linux', checks: [], summary: { passed: 0, warnings: 0, failed: 0 } };
      expect(dr.version).toBe('1.0');
    });
  });
});