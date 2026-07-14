import { describe, it, expect, vi } from 'vitest';
import { ParallelExecutor } from '../parallel';

describe('ParallelExecutor', () => {
  it('executes independent tasks', async () => {
    const executor = new ParallelExecutor({ maxConcurrency: 2 });
    const results = await executor.execute([
      { id: 'a', execute: async () => 1, dependencies: [] },
      { id: 'b', execute: async () => 2, dependencies: [] },
    ]);

    expect(results.length).toBe(2);
    expect(results.filter(r => r.success).length).toBe(2);
  });

  it('respects dependencies', async () => {
    const order: string[] = [];
    const executor = new ParallelExecutor({ maxConcurrency: 1 });

    await executor.execute([
      {
        id: 'a',
        execute: async () => { order.push('a'); return 1; },
        dependencies: [],
      },
      {
        id: 'b',
        execute: async () => { order.push('b'); return 2; },
        dependencies: ['a'],
      },
    ]);

    expect(order).toEqual(['a', 'b']);
  });

  it('reports blocked tasks', async () => {
    const executor = new ParallelExecutor({ maxConcurrency: 1 });
    const results = await executor.execute([
      {
        id: 'a',
        execute: async () => { throw new Error('fail'); },
        dependencies: [],
      },
      {
        id: 'b',
        execute: async () => 2,
        dependencies: ['a'],
      },
    ]);

    expect(results.length).toBe(2);
    expect(results.find(r => r.id === 'b')?.success).toBe(false);
    expect(results.find(r => r.id === 'b')?.error).toContain('Blocked');
  });

  it('handles errors in tasks', async () => {
    const executor = new ParallelExecutor({ maxConcurrency: 1 });
    const results = await executor.execute([
      {
        id: 'fail',
        execute: async () => { throw new Error('oops'); },
        dependencies: [],
      },
    ]);

    expect(results[0]?.success).toBe(false);
    expect(results[0]?.error).toBe('oops');
  });

  it('executeAll runs two waves', async () => {
    const executor = new ParallelExecutor({ maxConcurrency: 2 });
    const results = await executor.executeAll([
      { id: 'a', execute: async () => 'a', dependencies: [] },
      { id: 'b', execute: async () => 'b', dependencies: ['a'] },
    ]);

    expect(results.length).toBe(2);
  });
});
