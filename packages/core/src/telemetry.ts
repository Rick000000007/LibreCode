import type { TokenUsage } from 'librecode-types';

export interface ToolTiming {
  toolName: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  success: boolean;
  argsPreview?: string;
}

export interface TurnMetrics {
  turnNumber: number;
  tokenUsage: TokenUsage;
  toolCalls: number;
  durationMs: number;
}

export interface PerformanceReport {
  totalTurns: number;
  totalTokens: TokenUsage;
  totalDurationMs: number;
  averageTokensPerTurn: number;
  toolStats: Array<{ name: string; calls: number; avgDurationMs: number; successRate: number }>;
  costEstimate: number;
}

const COST_PER_TOKEN: Record<string, number> = {
  'gpt-4o': 0.0000025,
  'gpt-4o-mini': 0.00000015,
  'claude-sonnet-4-20250514': 0.000003,
  'default': 0.000001,
};

export class Telemetry {
  private toolTimings: ToolTiming[] = [];
  private turnMetrics: TurnMetrics[] = [];
  private sessionStart: number = Date.now();
  private memoryUsage: number[] = [];
  private modelName: string = 'default';

  setModel(model: string): void {
    this.modelName = model;
  }

  recordToolCall(name: string, success: boolean, durationMs: number, argsPreview?: string): void {
    this.toolTimings.push({
      toolName: name,
      startTime: Date.now() - durationMs,
      endTime: Date.now(),
      durationMs,
      success,
      argsPreview,
    });
  }

  recordTurn(turnNumber: number, usage: TokenUsage, toolCalls: number, durationMs: number): void {
    this.turnMetrics.push({ turnNumber, tokenUsage: usage, toolCalls, durationMs });
  }

  recordMemory(): void {
    const usage = process.memoryUsage();
    this.memoryUsage.push(usage.heapUsed);
  }

  getToolStats(): Array<{ name: string; calls: number; avgDurationMs: number; successRate: number }> {
    const byName = new Map<string, { count: number; totalDuration: number; successes: number }>();

    for (const t of this.toolTimings) {
      const existing = byName.get(t.toolName) ?? { count: 0, totalDuration: 0, successes: 0 };
      existing.count++;
      existing.totalDuration += t.durationMs;
      if (t.success) existing.successes++;
      byName.set(t.toolName, existing);
    }

    return Array.from(byName.entries()).map(([name, stats]) => ({
      name,
      calls: stats.count,
      avgDurationMs: Math.round(stats.totalDuration / stats.count),
      successRate: stats.successes / stats.count,
    }));
  }

  generateReport(): PerformanceReport {
    const totalTurns = this.turnMetrics.length;
    const totalTokens = this.turnMetrics.reduce(
      (acc, t) => ({
        promptTokens: acc.promptTokens + t.tokenUsage.promptTokens,
        completionTokens: acc.completionTokens + t.tokenUsage.completionTokens,
        totalTokens: acc.totalTokens + t.tokenUsage.totalTokens,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );

    const totalDurationMs = Date.now() - this.sessionStart;
    const averageTokensPerTurn = totalTurns > 0 ? Math.round(totalTokens.totalTokens / totalTurns) : 0;
    const costPerToken = COST_PER_TOKEN[this.modelName] ?? COST_PER_TOKEN['default']!;
    const costEstimate = totalTokens.totalTokens * costPerToken;

    return {
      totalTurns,
      totalTokens,
      totalDurationMs,
      averageTokensPerTurn,
      toolStats: this.getToolStats(),
      costEstimate: Math.round(costEstimate * 10000) / 10000,
    };
  }

  formatReport(): string {
    const report = this.generateReport();
    const lines: string[] = [];

    lines.push('─── Performance Report ───');
    lines.push(`Session duration: ${(report.totalDurationMs / 1000).toFixed(1)}s`);
    lines.push(`Total turns: ${report.totalTurns}`);
    lines.push(`Total tokens: ${report.totalTokens.totalTokens.toLocaleString()}`);
    lines.push(`  Prompt: ${report.totalTokens.promptTokens.toLocaleString()}`);
    lines.push(`  Completion: ${report.totalTokens.completionTokens.toLocaleString()}`);
    lines.push(`Avg tokens/turn: ${report.averageTokensPerTurn}`);
    lines.push(`Estimated cost: $${report.costEstimate.toFixed(4)}`);

    if (this.memoryUsage.length > 0) {
      const maxMem = Math.max(...this.memoryUsage);
      lines.push(`Peak heap: ${(maxMem / 1024 / 1024).toFixed(1)}MB`);
    }

    lines.push('');
    lines.push('Tool Statistics:');
    for (const ts of report.toolStats) {
      const rate = (ts.successRate * 100).toFixed(0);
      lines.push(`  ${ts.name}: ${ts.calls} calls, avg ${ts.avgDurationMs}ms, ${rate}% success`);
    }

    return lines.join('\n');
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStart;
  }

  reset(): void {
    this.toolTimings = [];
    this.turnMetrics = [];
    this.sessionStart = Date.now();
    this.memoryUsage = [];
  }
}

export class CostTracker {
  private costs: Array<{ model: string; tokens: number; cost: number; timestamp: number }> = [];

  record(model: string, tokens: number): void {
    const rate = COST_PER_TOKEN[model] ?? COST_PER_TOKEN['default']!;
    this.costs.push({
      model,
      tokens,
      cost: tokens * rate,
      timestamp: Date.now(),
    });
  }

  totalCost(): number {
    return this.costs.reduce((s, c) => s + c.cost, 0);
  }

  totalTokens(): number {
    return this.costs.reduce((s, c) => s + c.tokens, 0);
  }

  formatCost(): string {
    return `$${this.totalCost().toFixed(4)} (${this.totalTokens().toLocaleString()} tokens)`;
  }
}
