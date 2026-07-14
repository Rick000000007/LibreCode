import type { LogEntry, MetricValue, Span } from './observability.js';

export type OtelExporterType = 'console' | 'http' | 'grpc' | 'file';

export interface OtelExporterConfig {
  type: OtelExporterType;
  endpoint?: string;
  apiKey?: string;
  serviceName?: string;
  filePath?: string;
  batchSize?: number;
  exportIntervalMs?: number;
}

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
  startTime: number;
  endTime: number;
  attributes: Record<string, string | number | boolean>;
  status: { code: 'OK' | 'ERROR'; message?: string };
}

export interface OtelMetric {
  name: string;
  value: number;
  unit: string;
  attributes: Record<string, string>;
  timestamp: number;
}

declare class OTLPTraceExporter {
  constructor(config: { url?: string; headers?: Record<string, string> });
  export(spans: OtelSpan[]): Promise<void>;
  shutdown(): Promise<void>;
}

declare class OTLPMetricExporter {
  constructor(config: { url?: string; headers?: Record<string, string> });
  export(metrics: OtelMetric[]): Promise<void>;
  shutdown(): Promise<void>;
}

export class OpenTelemetryManager {
  private readonly config: OtelExporterConfig;
  private spans: OtelSpan[] = [];
  private metrics: OtelMetric[] = [];
  private exportTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: OtelExporterConfig) {
    this.config = {
      batchSize: 100,
      exportIntervalMs: 5000,
      serviceName: 'librecode',
      ...config,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.config.type !== 'console') {
      this.exportTimer = setInterval(() => {
        this.flush().catch(() => {});
      }, this.config.exportIntervalMs);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }
    await this.flush();
  }

  recordSpan(span: OtelSpan): void {
    this.spans.push(span);
    if (this.spans.length >= (this.config.batchSize ?? 100)) {
      this.flush().catch(() => {});
    }
  }

  recordMetric(metric: OtelMetric): void {
    this.metrics.push(metric);
  }

  createTrace(name: string, kind: OtelSpan['kind'] = 'INTERNAL'): { span: OtelSpan; end: (status?: OtelSpan['status']) => void } {
    const traceId = this.generateId(32);
    const spanId = this.generateId(16);
    const startTime = Date.now();

    const span: OtelSpan = {
      traceId,
      spanId,
      name,
      kind,
      startTime,
      endTime: 0,
      attributes: { 'service.name': this.config.serviceName ?? 'librecode' },
      status: { code: 'OK' },
    };

    const end = (status?: OtelSpan['status']) => {
      span.endTime = Date.now();
      if (status) span.status = status;
      else span.status = { code: 'OK' };
      this.recordSpan(span);
    };

    return { span, end };
  }

  async flush(): Promise<void> {
    const spansToExport = this.spans.splice(0);
    const metricsToExport = this.metrics.splice(0);

    if (spansToExport.length === 0 && metricsToExport.length === 0) return;

    switch (this.config.type) {
      case 'console':
        console.log('[OTel Spans]', JSON.stringify(spansToExport, null, 2));
        if (metricsToExport.length > 0) {
          console.log('[OTel Metrics]', JSON.stringify(metricsToExport, null, 2));
        }
        break;

      case 'http': {
        if (this.config.endpoint) {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;

          await Promise.all([
            fetch(`${this.config.endpoint}/v1/traces`, {
              method: 'POST', headers, body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: spansToExport }] }] }),
            }).catch(() => {}),
            fetch(`${this.config.endpoint}/v1/metrics`, {
              method: 'POST', headers, body: JSON.stringify({ resourceMetrics: [{ scopeMetrics: [{ metrics: metricsToExport }] }] }),
            }).catch(() => {}),
          ]);
        }
        break;
      }

      case 'file': {
        if (this.config.filePath) {
          const fs = await import('node:fs');
          const lines = [
            ...spansToExport.map(s => JSON.stringify({ type: 'span', ...s })),
            ...metricsToExport.map(m => JSON.stringify({ type: 'metric', ...m })),
          ];
          fs.appendFileSync(this.config.filePath, lines.join('\n') + '\n', 'utf-8');
        }
        break;
      }
    }
  }

  convertLogEntry(entry: LogEntry): OtelSpan {
    return {
      traceId: this.generateId(32),
      spanId: this.generateId(16),
      name: `log.${entry.level}`,
      kind: 'INTERNAL',
      startTime: entry.timestamp.getTime(),
      endTime: entry.timestamp.getTime(),
      attributes: {
        'log.level': entry.level,
        'log.message': entry.message,
        'log.source': entry.source,
        'service.name': this.config.serviceName ?? 'librecode',
        ...entry.data ? Object.fromEntries(Object.entries(entry.data).map(([k, v]) => [k, String(v)])) : {},
      },
      status: { code: entry.level === 'error' ? 'ERROR' : 'OK' },
    };
  }

  convertMetricValue(metric: MetricValue): OtelMetric {
    return {
      name: metric.name,
      value: metric.value,
      unit: '',
      attributes: metric.tags ?? {},
      timestamp: metric.timestamp.getTime(),
    };
  }

  convertSpan(span: Span): OtelSpan {
    return {
      traceId: span.traceId ?? this.generateId(32),
      spanId: span.id ?? this.generateId(16),
      name: span.name,
      kind: 'INTERNAL',
      startTime: span.startTime.getTime(),
      endTime: (span.endTime ?? span.startTime).getTime(),
      attributes: { 'service.name': this.config.serviceName ?? 'librecode', ...span.attributes ? Object.fromEntries(Object.entries(span.attributes).map(([k, v]) => [k, String(v)])) : {} },
      status: { code: span.status === 'error' ? 'ERROR' : 'OK' },
    };
  }

  private generateId(length: number): string {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i = 0; i < length; i++) {
      id += chars[Math.floor(Math.random() * 16)];
    }
    return id;
  }
}
