import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceTimeline } from '../timeline.js';
import { PersistenceStore } from '../persistence.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('WorkspaceTimeline', () => {
  let timeline: WorkspaceTimeline;

  beforeEach(() => {
    timeline = new WorkspaceTimeline();
  });

  it('starts empty', () => {
    expect(timeline.stats().total).toBe(0);
  });

  it('records events', () => {
    const event = timeline.record({
      type: 'file_edit',
      description: 'Modified index.ts',
      data: { file: 'index.ts' },
    });

    expect(event.id).toBeTruthy();
    expect(event.type).toBe('file_edit');
    expect(event.description).toBe('Modified index.ts');
    expect(timeline.stats().total).toBe(1);
  });

  it('records multiple event types', () => {
    timeline.record({ type: 'file_edit', description: 'edit', data: {} });
    timeline.record({ type: 'ai_edit', description: 'ai edit', data: {} });
    timeline.record({ type: 'tool_execution', description: 'tool run', data: {} });

    expect(timeline.stats().total).toBe(3);
    expect(timeline.stats().byType['file_edit']).toBe(1);
    expect(timeline.stats().byType['ai_edit']).toBe(1);
  });

  it('filters events by type', () => {
    timeline.record({ type: 'file_edit', description: 'a', data: {} });
    timeline.record({ type: 'file_edit', description: 'b', data: {} });
    timeline.record({ type: 'error', description: 'c', data: {} });

    const edits = timeline.getEvents({ type: 'file_edit' });
    expect(edits).toHaveLength(2);
  });

  it('filters events by limit', () => {
    for (let i = 0; i < 10; i++) {
      timeline.record({ type: 'file_edit', description: `edit ${i}`, data: {} });
    }

    expect(timeline.getEvents({ limit: 5 })).toHaveLength(5);
  });

  it('supports search', () => {
    timeline.record({ type: 'file_edit', description: 'modified package.json', data: {} });
    timeline.record({ type: 'error', description: 'compilation error in main.ts', data: {} });

    const results = timeline.search('package');
    expect(results).toHaveLength(1);
    expect(results[0]!.description).toContain('package');
  });

  it('provides diff between adjacent events', () => {
    timeline.record({ type: 'file_edit', description: 'version 1', data: { content: 'hello', file: 'test.txt' } });
    timeline.record({ type: 'file_edit', description: 'version 2', data: { content: 'hello world', file: 'test.txt' } });

    // Get first event
    const events = timeline.getEvents();
    const diff = timeline.getDiff(events[1]!.id);
    expect(diff).toBeDefined();
    expect(diff!.diff).toBeDefined();
  });

  it('clears all events', () => {
    timeline.record({ type: 'file_edit', description: 'test', data: {} });
    expect(timeline.stats().total).toBe(1);
    timeline.clear();
    expect(timeline.stats().total).toBe(0);
  });

  it('persists events when persistence store is provided', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'librecode-tl-test-'));
    const dbPath = path.join(dir, 'test.db');
    const store = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });

    const tl = new WorkspaceTimeline(store);
    tl.record({ type: 'file_edit', description: 'persisted', data: {} });

    // Load into new instance
    const store2 = new PersistenceStore({ dbPath, autoBackup: false, walMode: false });
    const tl2 = new WorkspaceTimeline(store2);
    expect(tl2.stats().total).toBe(1);

    store.close();
    store2.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* skip */ }
  });
});
