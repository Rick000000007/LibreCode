import type { AgentEvent } from 'librecode-types';
import type { Agent } from '../index.js';
import type { ToolRegistry } from 'librecode-tools';
import { PlanTasksTool, CompleteTaskTool } from './tools.js';

export class WorkflowEngine {
  constructor(
    private agent: Agent,
    private tools: ToolRegistry,
  ) {
    this.setupWorkflowTools();
  }

  private onEvent?: (event: AgentEvent) => void;

  private setupWorkflowTools() {
    this.tools.register(
      new PlanTasksTool((tasks) => {
        if (this.onEvent) {
          this.onEvent({ type: 'workflow_started', plan: tasks });
        }
      })
    );

    this.tools.register(
      new CompleteTaskTool((taskId, result) => {
        if (this.onEvent) {
          this.onEvent({ type: 'task_completed', taskId, result });
        }
      })
    );
  }

  async executeGoal(
    goal: string,
    onEvent: (event: AgentEvent) => void,
    onApproval?: (toolName: string, args: Record<string, unknown>, description: string) => Promise<boolean>
  ): Promise<string> {
    this.onEvent = onEvent;
    
    // Prefix the goal with a workflow prompt
    const workflowPrompt = `
Your goal is: "${goal}"

You must operate as a Workflow Engine. 
1. Use the \`plan_tasks\` tool FIRST to lay out the steps you will take to accomplish this goal.
2. Complete each task sequentially using your available tools.
3. Call \`complete_task\` after you finish each planned task to report its success.
4. If something fails, adapt your plan and proceed.
5. Provide a brief final summary when all tasks are complete.

## Project Memory
You should persist project structure, architecture, coding style, and task status in \`.librecode/architecture.md\` to avoid redundant repository analysis. Read this file if it exists, and update it as you discover or build new components.
`;

    const result = await this.agent.runTurnStreaming(workflowPrompt, onEvent, onApproval);
    
    if (this.onEvent) {
      this.onEvent({ type: 'workflow_completed', summary: result });
    }
    
    return result;
  }
}
