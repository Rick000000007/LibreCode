import { EventEmitter } from 'node:events';
import { PersistenceStore } from './persistence.js';
import { createDiff } from './checkpoint.js';

export type TimelineEventType =
  | 'file_edit'
  | 'ai_edit'
  | 'git_commit'
  | 'tool_execution'
  | 'command'
  | 'error'
  | 'checkpoint'
  | 'session'
  | 'macro_execution'
  | 'lsp_diagnostic'
  | 'provider_switch';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  description: string;
  timestamp: Date;
  data: Record<string, unknown>;
  sessionId?: string;
  tags?: string[];
  parentId?: string;
}

export interface TimelineDiff {
  event: TimelineEvent;
  previousEvent?: TimelineEvent;
  diff?: string;
}

export class WorkspaceTimeline extends EventEmitter {
  private events: TimelineEvent[] = [];
  private persistence: PersistenceStore | null = null;
  private maxEvents = 10000;

  constructor(persistence?: PersistenceStore) {
    super();
    this.persistence = persistence ?? null;
    this.loadFromPersistence();
  }

  private loadFromPersistence(): void {
    if (!this.persistence) return;
    try {
      const records = this.persistence.queryTimelineEvents({ limit: this.maxEvents });
      this.events = records.map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        type: r['type'] as TimelineEventType,
        description: r['description'] as string,
        timestamp: new Date(r['timestamp'] as string),
        data: typeof r['data'] === 'string' ? JSON.parse(r['data'] as string) : (r['data'] as Record<string, unknown>) ?? {},
        sessionId: r['session_id'] as string | undefined,
        tags: typeof r['tags'] === 'string' ? JSON.parse(r['tags'] as string) : (r['tags'] as string[] | undefined),
      }));
    } catch { /* skip */ }
  }

  record(event: Omit<TimelineEvent, 'id' | 'timestamp'>): TimelineEvent {
    const ev: TimelineEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    this.events.push(ev);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    if (this.persistence) {
      try {
        this.persistence.saveTimelineEvent({
          id: ev.id,
          type: ev.type,
          description: ev.description,
          timestamp: ev.timestamp,
          data: ev.data,
          sessionId: ev.sessionId,
          tags: ev.tags,
        });
      } catch { /* best-effort */ }
    }

    this.emit('event', ev);
    return ev;
  }

  getEvents(filter?: { type?: TimelineEventType; sessionId?: string; limit?: number; since?: Date; until?: Date }): TimelineEvent[] {
    let result = this.events;
    if (filter?.type) result = result.filter((e) => e.type === filter.type);
    if (filter?.sessionId) result = result.filter((e) => e.sessionId === filter.sessionId);
    if (filter?.since) result = result.filter((e) => e.timestamp >= filter.since!);
    if (filter?.until) result = result.filter((e) => e.timestamp <= filter.until!);
    return result
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, filter?.limit ?? 100);
  }

  getDiff(eventId: string): TimelineDiff | undefined {
    const idx = this.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return undefined;
    const event = this.events[idx]!;
    const prev = idx > 0 ? this.events[idx - 1] : undefined;
    let diff: string | undefined;

    if (prev && event.type === 'file_edit' && event.data['content'] && prev.data['content']) {
      diff = createDiff(
        prev.data['content'] as string,
        event.data['content'] as string,
      );
    }

    return { event, previousEvent: prev, diff };
  }

  search(query: string): TimelineEvent[] {
    const lower = query.toLowerCase();
    return this.events.filter(
      (e) =>
        e.description.toLowerCase().includes(lower) ||
        e.type.toLowerCase().includes(lower) ||
        JSON.stringify(e.data).toLowerCase().includes(lower),
    ).slice(0, 50);
  }

  restoreTo(eventId: string): boolean {
    const idx = this.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return false;

    const eventsToRestore = this.events.slice(0, idx + 1);
    const fileStates = new Map<string, string>();

    for (const e of eventsToRestore) {
      if (e.type === 'file_edit' && e.data['file'] && e.data['content']) {
        fileStates.set(e.data['file'] as string, e.data['content'] as string);
      }
    }

    for (const [file, content] of fileStates) {
      try {
        const fs = require('node:fs') as typeof import('node:fs');
        fs.writeFileSync(file, content, 'utf-8');
      } catch { /* skip */ }
    }

    this.record({
      type: 'checkpoint',
      description: `Restored to event ${eventId} (${this.events[idx]!.description})`,
      data: { restoredEventId: eventId, files: Array.from(fileStates.keys()) },
    });

    return true;
  }

  clear(): void {
    this.events = [];
    if (this.persistence) {
      const records = this.persistence.queryTimelineEvents({});
      for (const r of records) {
        this.persistence.deleteTimelineEvent(r['id'] as string);
      }
    }
    this.emit('cleared');
  }

  stats(): { total: number; byType: Record<string, number>; timeRange: { oldest?: Date; newest?: Date } } {
    const byType: Record<string, number> = {};
    for (const e of this.events) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }
    return {
      total: this.events.length,
      byType,
      timeRange: {
        oldest: this.events[0]?.timestamp,
        newest: this.events[this.events.length - 1]?.timestamp,
      },
    };
  }
}
