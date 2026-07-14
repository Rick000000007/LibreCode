export interface Task<T = unknown> {
  id: string;
  execute: () => Promise<T>;
  dependencies: string[];
  priority?: number;
}

export interface TaskResult<T = unknown> {
  id: string;
  success: boolean;
  result?: T;
  error?: string;
  startTime: number;
  endTime: number;
}

export interface ParallelOptions {
  maxConcurrency?: number;
  rateLimitPerSecond?: number;
}

export class ParallelExecutor {
  private options: Required<ParallelOptions>;

  constructor(options?: ParallelOptions) {
    this.options = {
      maxConcurrency: 4,
      rateLimitPerSecond: 10,
      ...options,
    };
  }

  async execute<T>(tasks: Task<T>[]): Promise<TaskResult<T>[]> {
    const completed = new Map<string, TaskResult<T>>();
    const results: TaskResult<T>[] = [];
    const queue = [...tasks];
    const running = new Set<Promise<void>>();
    const minInterval = 1000 / this.options.rateLimitPerSecond;
    let lastExecution = 0;

    while (queue.length > 0 || running.size > 0) {
      const available = queue.filter(t =>
        t.dependencies.every(dep => completed.has(dep) && completed.get(dep)!.success),
      );

      if (available.length === 0 && running.size === 0) {
        const blocked = queue.map(t => ({
          id: t.id,
          deps: t.dependencies.filter(d => !completed.has(d) || !completed.get(d)!.success),
        }));
        for (const b of blocked) {
          results.push({
            id: b.id,
            success: false,
            error: `Blocked by unfinished dependencies: ${b.deps.join(', ')}`,
            startTime: Date.now(),
            endTime: Date.now(),
          });
          completed.set(b.id, results[results.length - 1]!);
        }
        queue.length = 0;
        break;
      }

      while (available.length > 0 && running.size < this.options.maxConcurrency) {
        const task = available.shift()!;
        queue.splice(queue.indexOf(task), 1);

        const now = Date.now();
        const wait = Math.max(0, minInterval - (now - lastExecution));

        const promise = (async () => {
          if (wait > 0) await sleep(wait);
          lastExecution = Date.now();
          const startTime = Date.now();
          try {
            const result = await task.execute();
            const endTime = Date.now();
            const tr: TaskResult<T> = {
              id: task.id,
              success: true,
              result,
              startTime,
              endTime,
            };
            completed.set(task.id, tr);
            results.push(tr);
          } catch (err) {
            const endTime = Date.now();
            const tr: TaskResult<T> = {
              id: task.id,
              success: false,
              error: err instanceof Error ? err.message : String(err),
              startTime,
              endTime,
            };
            completed.set(task.id, tr);
            results.push(tr);
          }
        })();

        running.add(promise);
        promise.finally(() => running.delete(promise));
      }

      if (running.size > 0) {
        await Promise.race(running);
      }
    }

    return results;
  }

  async executeAll<T>(tasks: Task<T>[]): Promise<TaskResult<T>[]> {
    const independent = tasks.filter(t => t.dependencies.length === 0);
    const dependent = tasks.filter(t => t.dependencies.length > 0);
    const results: TaskResult<T>[] = [];

    const firstWave = await this.execute(independent);
    results.push(...firstWave);

    if (dependent.length > 0) {
      const secondWave = await this.execute(dependent);
      results.push(...secondWave);
    }

    return results;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
