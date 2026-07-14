export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  strategy: 'exponential' | 'linear' | 'fixed';
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  strategy: 'exponential',
  retryableStatuses: [429, 500, 502, 503, 504],
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(config: RetryConfig, attempt: number): number {
  switch (config.strategy) {
    case 'exponential':
      return Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
    case 'linear':
      return Math.min(config.baseDelayMs * (attempt + 1), config.maxDelayMs);
    case 'fixed':
      return config.baseDelayMs;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
  shouldRetry?: (error: unknown) => boolean,
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === cfg.maxRetries) break;
      if (shouldRetry && !shouldRetry(err)) throw err;
      const delay = calculateDelay(cfg, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

export function isRetryableStatus(status: number, retryableStatuses?: number[]): boolean {
  const statuses = retryableStatuses ?? DEFAULT_RETRY_CONFIG.retryableStatuses;
  return statuses.includes(status);
}
