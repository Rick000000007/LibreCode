import type { AstProviderRegistry } from './ast-editor/registry.js';
import type { CodeIndexer } from './rag.js';

export interface AgentTask {
  id: string;
  type: 'edit' | 'search' | 'refactor' | 'test' | 'analyze' | 'orchestrate';
  description: string;
  files?: string[];
  priority: number;
  dependencies?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  timeout?: number;
}

export class AgentOrchestrator {
  private tasks = new Map<string, AgentTask>();
  private running = new Set<string>();
  private maxConcurrency = 4;
  private scheduling = false;

  constructor(
    private registry: AstProviderRegistry,
    private indexer: CodeIndexer,
  ) {}

  async submit(task: Omit<AgentTask, 'status' | 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const full: AgentTask = { ...task, id, status: 'pending' };
    this.tasks.set(id, full);
    this.schedule();
    return id;
  }

  async schedule(): Promise<void> {
    if (this.scheduling) return;
    this.scheduling = true;
    try {
      const ready = Array.from(this.tasks.values())
        .filter(t => t.status === 'pending' && (t.dependencies ?? []).every(d => this.tasks.get(d)?.status === 'completed'))
        .sort((a, b) => b.priority - a.priority);

      for (const task of ready) {
        if (this.running.size >= this.maxConcurrency) break;
        this.running.add(task.id);
        task.status = 'running';
        this.execute(task).finally(() => {
          this.running.delete(task.id);
          this.schedule();
        });
      }
    } finally {
      this.scheduling = false;
    }
  }

  private async execute(task: AgentTask): Promise<void> {
    try {
      let resultPromise = this.dispatch(task);
      if (task.timeout && task.timeout > 0) {
        resultPromise = Promise.race([
          resultPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Task timed out after ${task.timeout}ms`)), task.timeout),
          ),
        ]);
      }
      task.result = await resultPromise;
      task.status = 'completed';
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async dispatch(task: AgentTask): Promise<string> {
    switch (task.type) {
      case 'search': {
        const results = await this.indexer.search(task.description);
        return results.map(r => `${r.chunk.file}:${r.chunk.startLine} (score: ${r.score.toFixed(3)})`).join('\n');
      }
      case 'analyze':
        return `Analyzed: ${task.description}`;
      default:
        return `Executed task ${task.id}: ${task.description}`;
    }
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  getStatus(): { pending: number; running: number; completed: number; failed: number } {
    const counts = { pending: 0, running: 0, completed: 0, failed: 0 };
    for (const t of this.tasks.values()) counts[t.status]++;
    return counts;
  }

  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (task && (task.status === 'pending' || task.status === 'running')) {
      task.status = 'failed';
      task.error = 'cancelled';
      this.running.delete(id);
      return true;
    }
    return false;
  }

  clear(): void {
    this.tasks.clear();
    this.running.clear();
  }
}
