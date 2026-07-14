import { BaseTool } from 'librecode-tools';

export class PlanTasksTool extends BaseTool {
  constructor(private onPlan: (tasks: string[]) => void) {
    super();
  }

  override name(): string {
    return 'plan_tasks';
  }

  override description(): string {
    return 'Create a list of tasks for the current workflow.';
  }

  override parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'The list of task descriptions.',
        },
      },
      required: ['tasks'],
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    const tasks = args['tasks'] as string[];
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return 'Error: tasks array is required and must not be empty.';
    }
    this.onPlan(tasks);
    return 'Tasks planned successfully. Please proceed with the first task.';
  }
}

export class CompleteTaskTool extends BaseTool {
  constructor(private onComplete: (taskId: string, result: string) => void) {
    super();
  }

  override name(): string {
    return 'complete_task';
  }

  override description(): string {
    return 'Mark a specific task as completed with a summary of the result.';
  }

  override parametersSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The exact string description of the task completed.',
        },
        result: {
          type: 'string',
          description: 'Summary of what was accomplished.',
        },
      },
      required: ['taskId', 'result'],
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    const taskId = String(args['taskId'] || '');
    const result = String(args['result'] || '');
    if (!taskId) return 'Error: taskId is required.';
    this.onComplete(taskId, result);
    return `Task "${taskId}" marked as complete.`;
  }
}
