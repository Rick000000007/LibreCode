import type { AgentEvent, Message } from 'librecode-types';
import type { Agent } from '../index.js';
import type { ToolRegistry } from 'librecode-tools';
import { PlanTasksTool, CompleteTaskTool } from './tools.js';

export interface PlanTask {
  id: string;
  description: string;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'retrying';
  retries: number;
  result?: string;
  error?: string;
}

export interface Plan {
  goal: string;
  tasks: PlanTask[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowOptions {
  maxRetriesPerTask?: number;
  reflectionEnabled?: boolean;
  parallelTasks?: boolean;
}

export class WorkflowEngine {
  private plan: Plan | null = null;
  private options: Required<WorkflowOptions>;

  constructor(
    private agent: Agent,
    private tools: ToolRegistry,
    options?: WorkflowOptions,
  ) {
    this.options = {
      maxRetriesPerTask: 3,
      reflectionEnabled: true,
      parallelTasks: false,
      ...options,
    };
    this.setupWorkflowTools();
  }

  private onEvent?: (event: AgentEvent) => void;

  private setupWorkflowTools() {
    this.tools.register(
      new PlanTasksTool((tasks) => {
        if (this.onEvent && this.plan) {
          this.plan.tasks = tasks.map((desc, i) => ({
            id: `task-${i + 1}`,
            description: desc,
            dependencies: this.inferDependencies(desc, tasks),
            status: 'pending' as const,
            retries: 0,
          }));
          this.plan.updatedAt = Date.now();
          this.onEvent({ type: 'workflow_started', plan: tasks });
        }
      }),
    );

    this.tools.register(
      new CompleteTaskTool((taskId, result) => {
        if (this.onEvent && this.plan) {
          const task = this.plan.tasks.find(t => t.id === taskId);
          if (task) {
            task.status = 'completed';
            task.result = result;
          }
          this.plan.updatedAt = Date.now();
          this.onEvent({ type: 'task_completed', taskId, result });
        }
      }),
    );
  }

  async executeGoal(
    goal: string,
    onEvent: (event: AgentEvent) => void,
    onApproval?: (
      toolName: string,
      args: Record<string, unknown>,
      description: string,
    ) => Promise<boolean>,
  ): Promise<string> {
    this.onEvent = onEvent;
    this.plan = { goal, tasks: [], createdAt: Date.now(), updatedAt: Date.now() };

    const beforeReflection = this.options.reflectionEnabled
      ? await this.reflectBefore(goal)
      : '';

    const workflowPrompt = `
Your goal is: "${goal}"

${beforeReflection ? `## Pre-execution Analysis\n${beforeReflection}\n` : ''}

You must operate as a Workflow Engine.
1. Use the \`plan_tasks\` tool FIRST to lay out the steps you will take.
2. Complete each task sequentially using your available tools.
3. Call \`complete_task\` after you finish each planned task.
4. If something fails, adapt your plan and retry up to ${this.options.maxRetriesPerTask} times.
5. Provide a brief final summary when all tasks are complete.

## Project Memory
Persist project structure, architecture, and task status in \`.librecode/architecture.md\`.
`;

    try {
      const result = await this.agent.runTurnStreaming(
        workflowPrompt,
        onEvent,
        onApproval,
      );

      if (this.options.reflectionEnabled && this.plan) {
        const failedTasks = this.plan.tasks.filter(t => t.status === 'failed');
        if (failedTasks.length > 0) {
          const recovery = await this.attemptRecovery(failedTasks, onEvent, onApproval);
          if (recovery) return recovery;
        }
      }

      const summary = this.buildSummary(result);
      if (this.onEvent) {
        this.onEvent({ type: 'workflow_completed', summary });
      }

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (this.onEvent) {
        this.onEvent({ type: 'workflow_completed', summary: `Failed: ${errorMsg}` });
      }

      throw err;
    }
  }

  getPlan(): Plan | null {
    return this.plan;
  }

  getProgress(): { total: number; completed: number; failed: number } {
    if (!this.plan) return { total: 0, completed: 0, failed: 0 };
    return {
      total: this.plan.tasks.length,
      completed: this.plan.tasks.filter(t => t.status === 'completed').length,
      failed: this.plan.tasks.filter(t => t.status === 'failed').length,
    };
  }

  private async reflectBefore(goal: string): Promise<string> {
    const reflectionMessages: Message[] = [
      {
        role: 'user',
        content: `Analyze this goal and provide a structured plan outline with:\n1. Key risks or challenges\n2. Files that likely need modification\n3. Dependencies between steps\n4. Testing strategy\n\nGoal: "${goal}"`,
      },
    ];

    try {
      const response = await this.agent.runTurn(reflectionMessages[0]!.content ?? goal);
      return response;
    } catch {
      return '';
    }
  }

  private async attemptRecovery(
    failedTasks: PlanTask[],
    onEvent: (event: AgentEvent) => void,
    onApproval?: (
      toolName: string,
      args: Record<string, unknown>,
      description: string,
    ) => Promise<boolean>,
  ): Promise<string | null> {
    const retryDescriptions = failedTasks
      .map(t => `${t.id}: ${t.description} (${t.error ?? 'unknown error'})`)
      .join('\n');

    const retryPrompt = `
The following tasks failed. Please retry each one, using a different approach if possible:

${retryDescriptions}

Analyze what went wrong and adjust your strategy.
`;

    try {
      return await this.agent.runTurnStreaming(retryPrompt, onEvent, onApproval);
    } catch {
      return null;
    }
  }

  private buildSummary(result: string): string {
    if (!this.plan) return result;

    const completed = this.plan.tasks.filter(t => t.status === 'completed').length;
    const failed = this.plan.tasks.filter(t => t.status === 'failed').length;
    const total = this.plan.tasks.length;

    return `${result}\n---\nPlan: ${completed}/${total} tasks completed${failed > 0 ? `, ${failed} failed` : ''}`;
  }

  private inferDependencies(desc: string, allTasks: string[]): string[] {
    const deps: string[] = [];
    for (let i = 0; i < allTasks.length; i++) {
      const priorTask = allTasks[i]!;
      if (desc.includes(priorTask) || desc.toLowerCase().includes(priorTask.toLowerCase())) {
        deps.push(`task-${i + 1}`);
      }
    }
    return deps;
  }
}
