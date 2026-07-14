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

const DEFAULT_TIMEOUT = 120_000;

function truncateStr(s: string, maxLen: number): string {
  const oneLine = s.split('\n').join(' ');
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen) + '…';
}

export class Agent {
  readonly ProviderName: string;
  readonly ProviderModel: string;
  private provider: LLMProvider;
  private providerManager: ProviderManager | null = null;
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
    if (!provider) return null;
    const agent = new Agent(
      provider,
      tools,
      config,
      workingDir,
      permissions,
      active.id,
      active.model,
    );
    agent.providerManager = pm;
    return agent;
  }

  setProvider(provider: LLMProvider, name: string, model: string): void {
    this.provider = provider;
    (this as { ProviderName: string }).ProviderName = name;
    (this as { ProviderModel: string }).ProviderModel = model;
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
        model: this.ProviderModel,
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
        const handleEvent = (event: {
          type: string;
          delta?: string;
          index?: number;
          id?: string;
          name?: string;
          argumentsDelta?: string;
          usage?: TokenUsage;
          message?: string;
        }) => {
          switch (event.type) {
            case 'text_delta':
              content += event.delta!;
              onEvent({ type: 'text_delta', delta: event.delta! });
              break;
            case 'tool_call_delta': {
              const idx = event.index!;
              const existing = toolCallsByIndex.get(idx) ?? {
                id: undefined,
                name: undefined,
                arguments: '',
              };
              if (event.id) existing.id = event.id;
              if (event.name) existing.name = event.name;
              existing.arguments += event.argumentsDelta ?? '';
              toolCallsByIndex.set(idx, existing);
              break;
            }
            case 'done':
              usage = event.usage ?? createTokenUsage();
              break;
            case 'error':
              throw new Error(`Stream error: ${event.message}`);
          }
        };

        if (this.providerManager) {
          await this.withTimeout(
            this.providerManager.streamWithFallback(request, handleEvent),
            'streamComplete',
          );
        } else {
          await this.withTimeout(
            this.provider.streamComplete(request, handleEvent),
            'streamComplete',
          );
        }
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
        model: this.ProviderModel,
        messages: [...this.messages],
        tools: this.tools.definitions(),
        temperature: 0.0,
        maxTokens: 4096,
        stream: false,
      };

      let response;
      try {
        response = await this.withTimeout(
          this.provider.complete(request),
          'complete',
        );
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

  private async withTimeout<T>(promise: Promise<T>, _name: string): Promise<T> {
    const timeout = DEFAULT_TIMEOUT;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timed out: ${_name} after ${timeout}ms`)), timeout),
      ),
    ]);
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

  async reflectBefore(userInput: string): Promise<string> {
    const reflectionPrompt = `Before responding, briefly analyze this request and plan your approach:

Request: "${userInput}"

Consider:
1. What files might need to be read or modified?
2. What is the most efficient sequence of tool calls?
3. What could go wrong?
4. How will you verify the result?

Respond with a brief 2-3 sentence plan.`;

    try {
      const reflectionMessages: Message[] = [
        { role: 'system', content: this.messages.find(m => m.role === 'system')?.content ?? 'You are a planning assistant.' },
        { role: 'user', content: reflectionPrompt },
      ];

      const request = {
        model: this.ProviderModel,
        messages: reflectionMessages,
        tools: [],
        temperature: 0.0,
        maxTokens: 512,
        stream: false,
      };

      const response = await this.withTimeout(
        this.provider.complete(request),
        'reflectBefore',
      );
      return response.content ?? '';
    } catch {
      return '';
    }
  }

  async reflectAfter(toolResults: Array<[string, string]>): Promise<void> {
    const errors = toolResults.filter(([, r]) => r.startsWith('Error:') || r.startsWith('Permission denied'));
    if (errors.length === 0) return;

    const errorSummary = errors.map(([id, msg]) => `Tool ${id}: ${msg}`).join('\n');
    this.messages.push({
      role: 'user',
      content: `The following tool calls returned errors. Please analyze and retry with corrections:\n\n${errorSummary}`,
    });
  }

  validateToolResult(toolName: string, _args: Record<string, unknown>, result: string): string | null {
    if (result.startsWith('Error:')) return result;
    if (result.startsWith('Permission denied')) return result;

    if (toolName === 'write_file' || toolName === 'edit_file') {
      if (!result.includes('written') && !result.includes('applied') && !result.includes('success')) {
        return `Warning: ${toolName} may not have completed successfully. Result: ${truncateStr(result, 100)}`;
      }
    }

    if (toolName === 'run_command') {
      if (result.length === 0) {
        return 'Warning: command produced no output. It may have failed silently.';
      }
      if (result.toLowerCase().includes('error') || result.toLowerCase().includes('failed')) {
        return `Warning: command may have failed:\n${truncateStr(result, 200)}`;
      }
    }

    return null;
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getLastToolResults(): Array<{ name: string; result: string }> {
    const results: Array<{ name: string; result: string }> = [];
    for (const msg of this.messages) {
      if (msg.role === 'tool' && msg.content) {
        const idx = this.messages.indexOf(msg);
        const toolMsg = this.messages[idx - 1];
        const toolCalls = toolMsg?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          const tc = toolCalls.find(tc => tc.id === msg.tool_call_id);
          if (tc) {
            results.push({ name: tc.function.name, result: msg.content });
          }
        }
      }
    }
    return results;
  }
}
