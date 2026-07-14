import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../workflow/engine.js';

function createMockTools() {
  const tools: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    register: (tool: any) => {
      tools[tool.name ?? tool.constructor?.name] = tool;
    },
    get: (name: string) => tools[name],
  };
}

function createMockAgent() {
  return {
    ProviderName: 'test',
    ProviderModel: 'test-model',
    setSystemPrompt: () => {},
    runTurn: async () => 'reflection result',
    runTurnStreaming: async () => 'stream result',
  };
}

describe('WorkflowEngine', () => {
  it('should create with default options', () => {
    const engine = new WorkflowEngine(createMockAgent() as any, createMockTools() as any);
    expect(engine.getPlan()).toBeNull();
    expect(engine.getProgress()).toEqual({ total: 0, completed: 0, failed: 0 });
  });

  it('should create with custom options', () => {
    const engine = new WorkflowEngine(createMockAgent() as any, createMockTools() as any, {
      maxRetriesPerTask: 5,
      reflectionEnabled: false,
    });
    expect(engine).toBeDefined();
  });
});
