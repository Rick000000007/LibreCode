import type {
  AgentConfig,
  Message,
  AgentEvent,
  TokenUsage,
} from 'librecode-types';
import { createTokenUsage } from 'librecode-types';
import type { LLMProvider, ProviderManager } from 'librecode-providers';
import { ToolRegistry, PermissionChecker } from 'librecode-tools';
import { ContextManager } from 'librecode-memory';
import { formatArgsPreview, countMessagesTokens } from 'librecode-utils';

export { generateSystemPrompt } from './prompt.js';
export { RepoMapper } from './repo_map.js';
export { WorkflowEngine } from './workflow/engine.js';
export { PlanTasksTool, CompleteTaskTool } from './workflow/tools.js';

export class Agent {
  ProviderName: string;
  ProviderModel: string;
  private provider: LLMProvider;
  private tools: ToolRegistry;
  private messages: Message[];
  private config: AgentConfig;
  private workingDir: string;
  private totalTokensUsed: TokenUsage;
  private permissions: PermissionChecker;
  private contextManager: ContextManager;

  constructor(
    provider: LLMProvider,
    tools: ToolRegistry,
    config: AgentConfig,
    workingDir: string,
    permissions: PermissionChecker,
    providerName?: string,
    providerModel?: string,
  ) {
    this.ProviderName = providerName ?? 'unknown';
    this.ProviderModel = providerModel ?? config.model;
    this.provider = provider;
    this.tools = tools;
    this.messages = [];
    this.config = config;
    this.workingDir = workingDir;
    this.totalTokensUsed = createTokenUsage();
    this.permissions = permissions;
    this.contextManager = new ContextManager(
      config.maxContextTokens,
      config.compactThreshold,
    );
  }

  static async fromProviderManager(
    pm: ProviderManager,
    tools: ToolRegistry,
    config: AgentConfig,
    workingDir: string,
    permissions: PermissionChecker,
  ): Promise<Agent | null> {
    const active = await pm.initialize();
    if (!active) return null;
    const provider = pm.getProvider();
    return new Agent(
      provider,
      tools,
      config,
      workingDir,
      permissions,
      active.id,
      active.model,
    );
  }

  setSystemPrompt(prompt: string): void {
    this.messages.push({ role: 'system', content: prompt });
  }

  supportsStreaming(): boolean {
    return this.provider.supportsStreaming();
  }

  async runTurnStreaming(
    userInput: string,
    onEvent: (event: AgentEvent) => void,
    onApproval?: (toolName: string, args: Record<string, unknown>, description: string) => Promise<boolean>,
  ): Promise<string> {
    this.messages.push({ role: 'user', content: userInput });

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      await this.maybeCompact();

      const request = {
        model: this.config.model,
        messages: [...this.messages],
        tools: this.tools.definitions(),
        temperature: 0.0,
        maxTokens: 4096,
        stream: true,
      };

      let content = '';
      const toolCallsByIndex: Map<
        number,
        { id?: string; name?: string; arguments: string }
      > = new Map();
      let usage = createTokenUsage();

      try {
        await this.provider.streamComplete(request, async (event) => {
          switch (event.type) {
            case 'text_delta':
              content += event.delta;
              onEvent({ type: 'text_delta', delta: event.delta });
              break;
            case 'tool_call_delta': {
              const idx = event.index;
              const existing = toolCallsByIndex.get(idx) ?? {
                id: undefined,
                name: undefined,
                arguments: '',
              };
              if (event.id) existing.id = event.id;
              if (event.name) existing.name = event.name;
              existing.arguments += event.argumentsDelta;
              toolCallsByIndex.set(idx, existing);
              break;
            }
            case 'done':
              usage = event.usage;
              break;
            case 'error':
              throw new Error(`Stream error: ${event.message}`);
          }
        });
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes('Context window exceeded')
        ) {
          await this.compactNow();
          continue;
        }
        throw err;
      }

      this.totalTokensUsed = {
        promptTokens:
          this.totalTokensUsed.promptTokens + usage.promptTokens,
        completionTokens:
          this.totalTokensUsed.completionTokens + usage.completionTokens,
        totalTokens: this.totalTokensUsed.totalTokens + usage.totalTokens,
      };

      if (toolCallsByIndex.size === 0) {
        this.messages.push({ role: 'assistant', content });
        onEvent({ type: 'turn_complete', turnNumber: turn + 1 });
        return content;
      }

      const toolCalls = Array.from(toolCallsByIndex.entries())
        .sort(([a], [b]) => a - b)
        .map(([_, tc]) => ({
          id: tc.id ?? '',
          type: 'function' as const,
          function: {
            name: tc.name ?? '',
            arguments: tc.arguments,
          },
        }))
        .filter((tc) => tc.id && tc.function.name);

      this.messages.push({
        role: 'assistant',
        content,
        tool_calls: toolCalls,
      });

      const toolResults = await this.executeToolsWithEvents(
        toolCalls,
        onEvent,
        onApproval,
      );

      for (const [id, result] of toolResults) {
        this.messages.push({ role: 'tool', content: result, tool_call_id: id });
      }

      onEvent({ type: 'turn_complete', turnNumber: turn + 1 });
    }

    throw new Error(
      `Agent exceeded maximum turns (${this.config.maxTurns})`,
    );
  }

  async runTurn(
    userInput: string,
    onApproval?: (toolName: string, args: Record<string, unknown>, description: string) => Promise<boolean>
  ): Promise<string> {
    this.messages.push({ role: 'user', content: userInput });

    for (let turn = 0; turn < this.config.maxTurns; turn++) {
      await this.maybeCompact();

      const request = {
        model: this.config.model,
        messages: [...this.messages],
        tools: this.tools.definitions(),
        temperature: 0.0,
        maxTokens: 4096,
        stream: false,
      };

      let response;
      try {
        response = await this.provider.complete(request);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes('Context window exceeded')
        ) {
          await this.compactNow();
          continue;
        }
        throw err;
      }

      this.totalTokensUsed = {
        promptTokens:
          this.totalTokensUsed.promptTokens + response.usage.promptTokens,
        completionTokens:
          this.totalTokensUsed.completionTokens +
          response.usage.completionTokens,
        totalTokens:
          this.totalTokensUsed.totalTokens + response.usage.totalTokens,
      };

      if (response.toolCalls.length === 0) {
        const content = response.content ?? '';
        this.messages.push({ role: 'assistant', content });
        return content;
      }

      this.messages.push({
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.toolCalls,
      });

      const toolResults = await this.executeToolsParallel(response.toolCalls, onApproval);

      for (const [id, result] of toolResults) {
        this.messages.push({ role: 'tool', content: result, tool_call_id: id });
      }
    }

    throw new Error(
      `Agent exceeded maximum turns (${this.config.maxTurns})`,
    );
  }

  private async executeToolsWithEvents(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
    onEvent: (event: AgentEvent) => void,
    onApproval?: (toolName: string, args: Record<string, unknown>, description: string) => Promise<boolean>,
  ): Promise<Array<[string, string]>> {
    const results: Array<[string, string]> = [];

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }

      const argsPreview = formatArgsPreview(toolName, args);
      onEvent({ type: 'tool_start', name: toolName, argsPreview });

      const permitted = await this.permissions.check(toolName, args, onApproval);

      if (!permitted) {
        const msg = `Permission denied for tool: ${toolName}`;
        onEvent({ type: 'tool_error', name: toolName, message: msg });
        results.push([tc.id, msg]);
        continue;
      }

      const tool = this.tools.get(toolName);
      if (!tool) {
        const msg = `Unknown tool: ${toolName}`;
        onEvent({ type: 'tool_error', name: toolName, message: msg });
        results.push([tc.id, msg]);
        continue;
      }

      try {
        const result = await tool.execute(args, this.workingDir);
        const summary = truncateStr(result, 100);
        onEvent({
          type: 'tool_result',
          name: toolName,
          success: true,
          summary,
        });
        results.push([tc.id, result]);
      } catch (e: unknown) {
        const msg = `Error: ${e instanceof Error ? e.message : String(e)}`;
        onEvent({ type: 'tool_error', name: toolName, message: msg });
        results.push([tc.id, msg]);
      }
    }

    return results;
  }

  private async executeToolsParallel(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
    onApproval?: (toolName: string, args: Record<string, unknown>, description: string) => Promise<boolean>
  ): Promise<Array<[string, string]>> {
    const results: Array<[string, string]> = [];

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }

      const permitted = await this.permissions.check(toolName, args, onApproval);

      if (!permitted) {
        results.push([tc.id, `Permission denied for tool: ${toolName}`]);
        continue;
      }

      const tool = this.tools.get(toolName);
      if (!tool) {
        results.push([tc.id, `Unknown tool: ${toolName}`]);
        continue;
      }

      try {
        const result = await tool.execute(args, this.workingDir);
        results.push([tc.id, result]);
      } catch (e: unknown) {
        results.push([
          tc.id,
          `Error: ${e instanceof Error ? e.message : String(e)}`,
        ]);
      }
    }

    return results;
  }

  private async maybeCompact(): Promise<void> {
    if (this.contextManager.needsCompaction(this.messages)) {
      await this.compactNow();
    }
  }

  private async compactNow(): Promise<void> {
    this.messages = this.contextManager.compact(this.messages);
  }

  estimateTokens(): number {
    return countMessagesTokens(this.messages);
  }

  contextUsage(): [number, number] {
    return [this.estimateTokens(), this.config.maxContextTokens];
  }

  tokenUsage(): TokenUsage {
    return { ...this.totalTokensUsed };
  }

  clearHistory(): void {
    const system = this.messages[0];
    this.messages = [];
    if (system?.role === 'system') {
      this.messages.push(system);
    }
  }

  setPermission(toolName: string, allow: boolean): void {
    if (allow) {
      this.permissions.setAlwaysAllow(toolName);
    } else {
      this.permissions.setDeny(toolName);
    }
  }

  resetPermission(toolName: string): void {
    this.permissions.resetTool(toolName);
  }

  listPermissions(): Record<string, string> {
    return this.permissions.listPermissions();
  }
}

function truncateStr(s: string, maxLen: number): string {
  const oneLine = s.split('\n').join(' ');
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen) + '…';
}
