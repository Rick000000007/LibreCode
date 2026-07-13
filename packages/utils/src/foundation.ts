// Event Bus, Errors, Result, Cancellation, Disposables, and Logging/Metrics foundation

// 1. Result Types
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// 2. Unified Error Hierarchy
export type LibreErrorCategory =
  | 'network'
  | 'auth'
  | 'config'
  | 'runtime'
  | 'system';

export class LibreError extends Error {
  constructor(
    public readonly code: string,
    public readonly category: LibreErrorCategory,
    message: string,
    public readonly recoverySuggestion?: string,
    public readonly technicalDetails?: string,
    public readonly originalCause?: Error
  ) {
    super(message);
    this.name = 'LibreError';
    if (originalCause) {
      (this as unknown as { cause: Error }).cause = originalCause;
    }
    if (originalCause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalCause.stack}`;
    }
  }

  static fromError(err: Error, category: LibreErrorCategory = 'system'): LibreError {
    if (err instanceof LibreError) return err;
    return new LibreError(
      'UNEXPECTED_ERROR',
      category,
      err.message,
      'Check system logs or run doctor command to diagnose.',
      err.stack,
      err
    );
  }
}

// 3. Event Bus
type Listener<T = unknown> = (event: T) => void | Promise<void>;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on<K extends string, T = unknown>(event: K, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  off<K extends string, T = unknown>(event: K, listener: Listener<T>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as Listener<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit<K extends string, T = unknown>(event: K, payload: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        const res = listener(payload);
        if (res instanceof Promise) {
          res.catch((err) => {
            console.error(`EventBus listener rejected for event ${event}:`, err);
          });
        }
      } catch (err) {
        console.error(`EventBus listener threw for event ${event}:`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

// 4. Cancellation & Timeout Utilities
export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Operation cancelled by AbortSignal');
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Operation cancelled by AbortSignal'));
    }

    const timer = setTimeout(() => {
      reject(new TimeoutError());
    }, ms);

    let abortHandler: (() => void) | null = null;
    if (signal) {
      abortHandler = () => {
        clearTimeout(timer);
        reject(new Error('Operation cancelled by AbortSignal'));
      };
      signal.addEventListener('abort', abortHandler);
    }

    promise
      .then((val) => {
        clearTimeout(timer);
        if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
        reject(err);
      });
  });
}

// 5. Disposable Resource Management
export interface Disposable {
  dispose(): void | Promise<void>;
}

export class DisposableStore implements Disposable {
  private toDispose = new Set<Disposable | (() => void)>();
  private disposed = false;

  add<T extends Disposable | (() => void)>(disposable: T): T {
    if (this.disposed) {
      if (typeof disposable === 'function') {
        disposable();
      } else {
        disposable.dispose();
      }
      return disposable;
    }
    this.toDispose.add(disposable);
    return disposable;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.toDispose) {
      try {
        if (typeof item === 'function') {
          item();
        } else {
          await item.dispose();
        }
      } catch (err) {
        console.error('Error during resource disposal:', err);
      }
    }
    this.toDispose.clear();
  }
}

// 6. Structured Logging & Metrics Interfaces
export interface LogMeta {
  [key: string]: unknown;
}

export class Logger {
  constructor(private name: string) {}

  info(message: string, meta?: LogMeta): void {
    this.log('INFO', message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.log('WARN', message, meta);
  }

  error(message: string, error?: Error, meta?: LogMeta): void {
    this.log('ERROR', message, {
      ...meta,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
    });
  }

  private log(level: string, message: string, meta?: LogMeta): void {
    const timestamp = new Date().toISOString();
    const formatted = JSON.stringify({
      timestamp,
      level,
      logger: this.name,
      message,
      ...meta,
    });
    // Write to console if in debug mode, or structured stream
    if (process.env['DEBUG'] === 'true') {
      console.log(formatted);
    }
  }
}

export interface MetricEntry {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

export class MetricsCollector {
  private metrics: MetricEntry[] = [];

  record(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  getMetrics(): MetricEntry[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
  }
}
