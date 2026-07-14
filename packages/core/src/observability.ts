import { EventEmitter } from 'node:events';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  trace?: string;
}

export interface MetricValue {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

export interface Span {
  id: string;
  parentId?: string;
  traceId: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
}

export interface Trace {
  id: string;
  name: string;
  spans: Span[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'ok' | 'error';
}

export class ObservabilityManager {
  private logs: LogEntry[] = [];
  private metrics: MetricValue[] = [];
  private traces = new Map<string, Trace>();
  private activeSpans = new Map<string, Span>();
  private events = new EventEmitter();
  private logLimit = 10000;
  private metricLimit = 50000;
  private traceLimit = 1000;

  log(level: LogLevel, source: string, message: string, data?: Record<string, unknown>): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      source,
      message,
      data,
      trace: level === 'error' ? new Error().stack : undefined,
    });
    if (this.logs.length > this.logLimit * 2) {
      this.logs = this.logs.slice(-this.logLimit);
    }
    this.events.emit('log', { level, source, message, data });
  }

  debug(source: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', source, message, data);
  }

  info(source: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', source, message, data);
  }

  warn(source: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', source, message, data);
  }

  error(source: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', source, message, data);
  }

  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      tags: tags ?? {},
      timestamp: new Date(),
    });
    if (this.metrics.length > this.metricLimit * 2) {
      this.metrics = this.metrics.slice(-this.metricLimit);
    }
    this.events.emit('metric', { name, value, tags });
  }

  startSpan(name: string, attributes?: Record<string, unknown>, parentId?: string): Span {
    const traceId = parentId ? (this.activeSpans.get(parentId)?.traceId ?? crypto.randomUUID()) : crypto.randomUUID();
    const span: Span = {
      id: crypto.randomUUID(),
      parentId,
      traceId,
      name,
      startTime: new Date(),
      status: 'ok',
      attributes: attributes ?? {},
    };

    this.activeSpans.set(span.id, span);
    this.events.emit('span:start', span);
    return span;
  }

  endSpan(spanId: string, status: 'ok' | 'error' = 'ok'): Span | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) return undefined;

    span.endTime = new Date();
    span.duration = span.endTime.getTime() - span.startTime.getTime();
    span.status = status;
    this.activeSpans.delete(spanId);

    let trace = this.traces.get(span.traceId);
    if (!trace) {
      trace = {
        id: span.traceId,
        name: span.name,
        spans: [],
        startTime: span.startTime,
        status: 'ok',
      };
      this.traces.set(span.traceId, trace);
    }

    trace.spans.push(span);
    trace.endTime = span.endTime;
    trace.duration = span.endTime.getTime() - trace.startTime.getTime();
    if (status === 'error') trace.status = 'error';

    if (this.traces.size > this.traceLimit * 2) {
      const entries = Array.from(this.traces.entries())
        .sort((a, b) => a[1].startTime.getTime() - b[1].startTime.getTime());
      const toDelete = entries.slice(0, entries.length - this.traceLimit);
      for (const [key] of toDelete) this.traces.delete(key);
    }

    this.events.emit('span:end', span);
    return span;
  }

  async trace<T>(name: string, fn: () => Promise<T>, timeout?: number): Promise<T> {
    const span = this.startSpan(name);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let result: T;
      if (timeout && timeout > 0) {
        result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Trace timeout: ${name} (${timeout}ms)`)), timeout);
          }),
        ]);
      } else {
        result = await fn();
      }
      this.endSpan(span.id, 'ok');
      return result;
    } catch (err) {
      this.endSpan(span.id, 'error');
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  syncTrace<T>(name: string, fn: () => T): T {
    const span = this.startSpan(name);
    try {
      const result = fn();
      this.endSpan(span.id, 'ok');
      return result;
    } catch (err) {
      this.endSpan(span.id, 'error');
      throw err;
    }
  }

  getLogs(filter?: { level?: LogLevel; source?: string; limit?: number }): LogEntry[] {
    let result = this.logs;
    if (filter?.level) result = result.filter(l => l.level === filter.level);
    if (filter?.source) result = result.filter(l => l.source === filter.source);
    if (filter?.limit) result = result.slice(-filter.limit);
    return result;
  }

  getMetrics(name?: string, tags?: Record<string, string>): MetricValue[] {
    let result = this.metrics;
    if (name) result = result.filter(m => m.name === name);
    if (tags) {
      result = result.filter(m =>
        Object.entries(tags).every(([k, v]) => m.tags[k] === v),
      );
    }
    return result;
  }

  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  getTraces(limit: number = 10): Trace[] {
    return Array.from(this.traces.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  queryLogs(query: string): LogEntry[] {
    const lower = query.toLowerCase();
    return this.logs.filter(l =>
      l.message.toLowerCase().includes(lower) ||
      l.source.toLowerCase().includes(lower),
    );
  }

  clear(): void {
    this.logs = [];
    this.metrics = [];
    this.traces.clear();
    this.activeSpans.clear();
    this.events.removeAllListeners();
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.events.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.events.off(event, handler);
  }

  removeAllListeners(event?: string): void {
    if (event) this.events.removeAllListeners(event);
    else this.events.removeAllListeners();
  }
}
