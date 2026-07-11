import type { LLMProvider } from './base.js';
import type { CompletionRequest } from 'librecode-types';

export interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  errorRate: number;
  uptime: number;
  consecutiveFailures: number;
  tokenThroughput: number;
  lastChecked: number;
}

interface ProviderTracking {
  providerId: string;
  provider: LLMProvider;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  errorRate: number;
  uptime: number;
  consecutiveFailures: number;
  totalRequests: number;
  failedRequests: number;
  tokenThroughput: number;
  lastChecked: number;
  lastError: string | null;
  history: number[]; // recent latency samples
}

export class HealthMonitor {
  private providers: Map<string, ProviderTracking> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private checkIntervalMs: number;

  constructor(checkIntervalMs = 60_000) {
    this.checkIntervalMs = checkIntervalMs;
  }

  register(providerId: string, provider: LLMProvider): void {
    this.providers.set(providerId, {
      providerId,
      provider,
      status: 'unknown',
      latencyMs: 0,
      errorRate: 0,
      uptime: 1,
      consecutiveFailures: 0,
      totalRequests: 0,
      failedRequests: 0,
      tokenThroughput: 0,
      lastChecked: 0,
      lastError: null,
      history: [],
    });
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.runChecks().catch(() => {});
    }, this.checkIntervalMs);
    // Run initial check
    this.runChecks().catch(() => {});
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async runChecks(): Promise<void> {
    const checks: Promise<void>[] = [];
    for (const [id, tracking] of this.providers) {
      checks.push(this.checkProvider(id, tracking));
    }
    await Promise.allSettled(checks);
  }

  private async checkProvider(id: string, tracking: ProviderTracking): Promise<void> {
    try {
      const testRequest: CompletionRequest = {
        model: 'health-check',
        messages: [{ role: 'user', content: 'ok' }],
        tools: [],
        maxTokens: 1,
        stream: false,
      };
      const start = Date.now();
      await tracking.provider.complete(testRequest);
      const latency = Date.now() - start;

      tracking.latencyMs = latency;
      tracking.history.push(latency);
      if (tracking.history.length > 20) {
        tracking.history.shift();
      }

      tracking.totalRequests++;
      tracking.consecutiveFailures = 0;
      tracking.lastChecked = Date.now();
      tracking.lastError = null;

      // Recalculate status
      this.recalculateStatus(tracking);
    } catch (err) {
      tracking.totalRequests++;
      tracking.failedRequests++;
      tracking.consecutiveFailures++;
      tracking.lastChecked = Date.now();
      tracking.lastError = err instanceof Error ? err.message : String(err);

      this.recalculateStatus(tracking);
    }
  }

  private recalculateStatus(tracking: ProviderTracking): void {
    tracking.errorRate = tracking.totalRequests > 0
      ? tracking.failedRequests / tracking.totalRequests
      : 0;

    tracking.uptime = tracking.totalRequests > 0
      ? (tracking.totalRequests - tracking.failedRequests) / tracking.totalRequests
      : 1;

    const avgLatency = tracking.history.length > 0
      ? tracking.history.reduce((a, b) => a + b, 0) / tracking.history.length
      : 0;

    // Determine status
    if (tracking.consecutiveFailures >= 5) {
      tracking.status = 'unhealthy';
    } else if (tracking.consecutiveFailures >= 1) {
      tracking.status = 'degraded';
    } else if (tracking.consecutiveFailures === 0 && tracking.totalRequests > 0) {
      tracking.status = 'healthy';
    } else if (avgLatency > 10_000) {
      tracking.status = 'degraded';
    } else if (tracking.errorRate > 0.3 && tracking.totalRequests > 5) {
      tracking.status = 'degraded';
    } else {
      tracking.status = 'unknown';
    }
  }

  recordSuccess(providerId: string, latencyMs: number, tokensGenerated: number): void {
    const tracking = this.providers.get(providerId);
    if (!tracking) return;

    tracking.totalRequests++;
    tracking.consecutiveFailures = 0;
    tracking.latencyMs = latencyMs;
    tracking.tokenThroughput = tokensGenerated / (latencyMs / 1000);
    tracking.history.push(latencyMs);
    if (tracking.history.length > 20) tracking.history.shift();
    tracking.lastChecked = Date.now();
    tracking.lastError = null;

    this.recalculateStatus(tracking);
  }

  recordFailure(providerId: string): void {
    const tracking = this.providers.get(providerId);
    if (!tracking) return;

    tracking.totalRequests++;
    tracking.failedRequests++;
    tracking.consecutiveFailures++;
    tracking.lastChecked = Date.now();

    this.recalculateStatus(tracking);
  }

  getSnapshot(): Map<string, HealthSnapshot> {
    const snapshot = new Map<string, HealthSnapshot>();
    for (const [id, tracking] of this.providers) {
      snapshot.set(id, {
        status: tracking.status,
        latencyMs: tracking.latencyMs,
        errorRate: tracking.errorRate,
        uptime: tracking.uptime,
        consecutiveFailures: tracking.consecutiveFailures,
        tokenThroughput: tracking.tokenThroughput,
        lastChecked: tracking.lastChecked,
      });
    }
    return snapshot;
  }

  isHealthy(providerId: string): boolean {
    const tracking = this.providers.get(providerId);
    if (!tracking) return true;
    return tracking.status === 'healthy' || tracking.status === 'unknown';
  }

  getStatus(providerId: string): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' {
    return this.providers.get(providerId)?.status ?? 'unknown';
  }
}
