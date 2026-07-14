import * as dns from 'node:dns';
import { type ConnectionDiagnostics } from 'librecode-types';
import { classifyError } from './error-classifier.js';
import { LibreError, MetricsCollector, Logger } from 'librecode-utils';

export interface HttpClientOptions {
  baseUrl: string;
  apiKey?: string;
  organization?: string;
  project?: string;
  customHeaders?: Record<string, string>;
  timeout?: number; // Request read/write timeout
  connectTimeout?: number; // Connection establishment timeout
  dnsTimeout?: number; // DNS resolution timeout
  maxRetries?: number;
  retryDelay?: number;
  proxyUrl?: string;
  preferIpv4?: boolean;
  allowRetryOnNonIdempotent?: boolean;
  /** Provider name for debug logging */
  name?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string | ReadableStream;
  diagnostics: ConnectionDiagnostics;
}

interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

// Global metrics collector for HTTP layer
export const httpMetrics = new MetricsCollector();
const logger = new Logger('HttpClient');

function isIdempotentMethod(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

function isRetryableError(err: Error): boolean {
  const cause = (err as any).cause;
  const msg = `${err.message} ${cause instanceof Error ? cause.message : String(cause || '')}`.toLowerCase();
  return (
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('esocketerror') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('timeout')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHostname(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.hostname;
  } catch {
    return baseUrl;
  }
}

function getPort(baseUrl: string): number {
  try {
    const url = new URL(baseUrl);
    return parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);
  } catch {
    return 443;
  }
}

async function dnsLookupWithTimeout(
  hostname: string,
  preferIpv4: boolean,
  timeoutMs: number
): Promise<ConnectionDiagnostics> {
  const diag: ConnectionDiagnostics = {};
  const dnsPromise = preferIpv4
    ? dns.promises.resolve4(hostname)
    : dns.promises.resolve(hostname);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('DNS resolution timed out')), timeoutMs);
  });

  try {
    const addresses = await Promise.race([dnsPromise, timeoutPromise]);
    diag.dnsLookup = `${hostname} -> ${addresses.join(', ')}`;
  } catch (err) {
    diag.dnsLookup = `${hostname} -> DNS failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  return diag;
}

function shouldRetryOnStatus(status: number, method: string, allowNonIdempotent: boolean): boolean {
  if (!RETRYABLE_STATUSES.has(status)) return false;
  if (isIdempotentMethod(method)) return true;
  return allowNonIdempotent;
}

export class HttpClient {
  private options: HttpClientOptions;
  private baseUrl: URL;

  constructor(options: HttpClientOptions) {
    this.options = {
      timeout: 30000,
      connectTimeout: 10000,
      dnsTimeout: 5000,
      maxRetries: 3,
      retryDelay: 1000,
      allowRetryOnNonIdempotent: false,
      ...options,
    };
    this.baseUrl = new URL(options.baseUrl);
  }

  getApiKey(): string | undefined {
    return this.options.apiKey;
  }

  getOptions(): Readonly<HttpClientOptions> {
    return this.options;
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    stream?: boolean,
    requestOptions?: { signal?: AbortSignal; timeout?: number }
  ): Promise<HttpResponse> {
    // 1. Immediate Abort Check
    if (requestOptions?.signal?.aborted) {
      throw new LibreError(
        'REQUEST_CANCELLED',
        'network',
        'Request was cancelled via AbortSignal before sending',
        'Retry the operation if needed.'
      );
    }

    // Ensure baseUrl ends with / and path doesn't start with / so new URL() preserves base paths
    const baseHref = this.baseUrl.href.endsWith('/') ? this.baseUrl.href : `${this.baseUrl.href}/`;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(cleanPath, baseHref);
    const hostname = url.hostname;
    const diag: ConnectionDiagnostics = {};

    const retryPolicy: RetryPolicy = {
      maxRetries: this.options.maxRetries ?? DEFAULT_RETRY.maxRetries,
      baseDelayMs: this.options.retryDelay ?? DEFAULT_RETRY.baseDelayMs,
      maxDelayMs: DEFAULT_RETRY.maxDelayMs,
    };

    let lastError: Error | null = null;
    const startTime = Date.now();

    if (this.isDebugEnabled()) {
      process.stderr.write(`\x1B[90m[DEBUG] HttpClient ---\n`);
      process.stderr.write(`[DEBUG] Provider: ${this.options.name ?? 'unknown'}\n`);
      process.stderr.write(`[DEBUG] Base URL: ${this.baseUrl.href}\n`);
      process.stderr.write(`[DEBUG] Full URL: ${method} ${new URL(path.startsWith('/') ? path.slice(1) : path, this.baseUrl.href.endsWith('/') ? this.baseUrl.href : `${this.baseUrl.href}/`).toString()}\n`);
      process.stderr.write(`[DEBUG] Method: ${method}\n`);
      process.stderr.write(`[DEBUG] Max Retries: ${retryPolicy.maxRetries}\n`);
      process.stderr.write(`[DEBUG] Timeout: ${this.options.timeout}ms\n`);
      process.stderr.write(`[DEBUG] ---\x1B[39m\n`);
    }

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      if (requestOptions?.signal?.aborted) {
        throw new LibreError(
          'REQUEST_CANCELLED',
          'network',
          'Request cancelled during retry delay',
          'Try again later.'
        );
      }

      try {
        if (attempt > 0) {
          const delay = Math.min(
            retryPolicy.baseDelayMs * Math.pow(2, attempt - 1),
            retryPolicy.maxDelayMs,
          );
          if (this.isDebugEnabled()) {
            process.stderr.write(`\x1B[90m[DEBUG] Retry attempt ${attempt}/${retryPolicy.maxRetries} after ${delay}ms delay\x1B[39m\n`);
          }
          await sleep(delay);
        }

        // Separate DNS Timeout
        if (attempt === 0) {
          let dnsDiag: ConnectionDiagnostics;
          try {
            const dnsStart = Date.now();
            dnsDiag = await dnsLookupWithTimeout(
              hostname,
              this.options.preferIpv4 ?? false,
              this.options.dnsTimeout ?? 5000
            );
            if (this.isDebugEnabled()) {
              process.stderr.write(`\x1B[90m[DEBUG] DNS: ${dnsDiag.dnsLookup ?? hostname} (${Date.now() - dnsStart}ms)\x1B[39m\n`);
            }
          } catch (dnsErr) {
            if (this.isDebugEnabled()) {
              process.stderr.write(`\x1B[90m[DEBUG] DNS: FAILED - ${dnsErr instanceof Error ? dnsErr.message : String(dnsErr)}\x1B[39m\n`);
            }
            dnsDiag = {};
          }
          Object.assign(diag, dnsDiag);
        }

        const result = await this.doFetch(method, url, diag, body, stream, requestOptions);

        const duration = Date.now() - startTime;
        httpMetrics.record('http_request_duration', duration, {
          method,
          host: hostname,
          status: String(result.status),
          attempt: String(attempt),
        });

        if (result.status >= 200 && result.status < 300) {
          result.diagnostics = diag;
          return result;
        }

        if (result.status >= 400) {
          if (this.isDebugEnabled()) {
            const bodyPreview = typeof result.body === 'string' ? result.body.slice(0, 200) : '<streaming>';
            process.stderr.write(`\x1B[90m[DEBUG] Non-2xx status: ${result.status}, body: ${bodyPreview}\x1B[39m\n`);
          }
          if (
            !stream &&
            shouldRetryOnStatus(result.status, method, this.options.allowRetryOnNonIdempotent ?? false) &&
            attempt < retryPolicy.maxRetries
          ) {
            if (this.isDebugEnabled()) {
              process.stderr.write(`\x1B[90m[DEBUG] Status ${result.status} is retryable, retry ${attempt + 1}/${retryPolicy.maxRetries}...\x1B[39m\n`);
            }
            lastError = new Error(`HTTP ${result.status}: ${(result.body as string).slice(0, 100)}`);
            continue;
          }
          const errorMsg = classifyError(result.status, result.body as string);
          lastError = new Error(errorMsg);
          (lastError as any).statusCode = result.status;
          throw lastError;
        }

        result.diagnostics = diag;
        return result;
      } catch (err) {
        const duration = Date.now() - startTime;
        httpMetrics.record('http_request_error', duration, {
          method,
          host: hostname,
          error: err instanceof Error ? err.name : 'UnknownError',
          attempt: String(attempt),
        });

        if (this.isDebugEnabled()) {
          process.stderr.write(`\x1B[90m[DEBUG] Error (attempt ${attempt + 1}/${retryPolicy.maxRetries + 1}): ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
        }

        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            if (this.isDebugEnabled()) {
              process.stderr.write(`\x1B[90m[DEBUG] Error Type: TIMEOUT/ABORTED (after ${Date.now() - startTime}ms)\x1B[39m\n`);
            }
            throw new LibreError(
              'REQUEST_CANCELLED',
              'network',
              'Request timed out or aborted.',
              'Check network load or raise timeout options.',
              err.message,
              err
            );
          }
          if (
            isRetryableError(err) &&
            (isIdempotentMethod(method) || (this.options.allowRetryOnNonIdempotent ?? false)) &&
            attempt < retryPolicy.maxRetries
          ) {
            if (this.isDebugEnabled()) {
              process.stderr.write(`\x1B[90m[DEBUG] Error is retryable, will retry...\x1B[39m\n`);
            }
            lastError = err;
            continue;
          }
          if (this.isDebugEnabled()) {
            process.stderr.write(`\x1B[90m[DEBUG] Error Type: NON-RETRYABLE, throwing\x1B[39m\n`);
          }
          throw this.enhanceError(err, url.toString(), diag);
        }
        throw err;
      }
    }

    if (this.isDebugEnabled()) {
      process.stderr.write(`\x1B[90m[DEBUG] All ${retryPolicy.maxRetries} retries exhausted, throwing final error\x1B[39m\n`);
    }

    throw this.enhanceError(
      lastError ?? new Error(`Request failed after ${retryPolicy.maxRetries} retries`),
      url.toString(),
      diag
    );
  }

  private isDebugEnabled(): boolean {
    return process.env['LIBRECODE_DEBUG'] === '1' || process.env['DEBUG']?.includes('librecode') === true;
  }

  private redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'authorization' || lowerKey === 'x-api-key' || lowerKey === 'api-key') {
        redacted[key] = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '***';
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  private async doFetch(
    method: string,
    url: URL,
    diag: ConnectionDiagnostics,
    body?: unknown,
    stream?: boolean,
    requestOptions?: { signal?: AbortSignal; timeout?: number }
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'librecode/0.2.3',
      ...this.options.customHeaders,
    };

    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }
    if (this.options.organization) {
      headers['OpenAI-Organization'] = this.options.organization;
    }
    if (this.options.project) {
      headers['OpenAI-Project'] = this.options.project;
    }

    const controller = new AbortController();
    const timeoutMs = requestOptions?.timeout ?? this.options.timeout ?? 30000;
    const timeoutId = setTimeout(() => {
      logger.warn(`Request to ${url} timed out after ${timeoutMs}ms`);
      controller.abort();
    }, timeoutMs);

    // Propagate AbortSignal
    let abortHandler: (() => void) | null = null;
    if (requestOptions?.signal) {
      abortHandler = () => {
        controller.abort();
      };
      requestOptions.signal.addEventListener('abort', abortHandler);
    }

    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const fetchOptions: RequestInit = {
      method,
      headers,
      body: bodyStr,
      signal: controller.signal,
    };

    const startTime = Date.now();

    if (this.isDebugEnabled()) {
      const redactedHeaders = this.redactHeaders(headers);
      process.stderr.write(`\x1B[90m[DEBUG] --- Request ---\n`);
      process.stderr.write(`[DEBUG] URL: ${method} ${url.toString()}\n`);
      process.stderr.write(`[DEBUG] Headers: ${JSON.stringify(redactedHeaders, null, 2)}\n`);
      if (bodyStr) {
        const truncatedBody = bodyStr.length > 500 ? bodyStr.slice(0, 500) + '...' : bodyStr;
        process.stderr.write(`[DEBUG] Body: ${truncatedBody}\n`);
      }
      process.stderr.write(`[DEBUG] ---\x1B[39m\n`);
    }

    try {
      let fetchUrl = url.toString();
      // Workaround for Node.js fetch() failing on localhost with IPv6 (e.g. in Termux)
      if (url.hostname === 'localhost') {
        fetchUrl = fetchUrl.replace('localhost', '127.0.0.1');
      }

      const response = await fetch(fetchUrl, fetchOptions);

      const latency = Date.now() - startTime;
      diag.httpStatus = response.status;
      diag.contentType = response.headers.get('content-type') ?? undefined;

      if (this.isDebugEnabled()) {
        process.stderr.write(`\x1B[90m[DEBUG] --- Response ---\n`);
        process.stderr.write(`[DEBUG] Status: ${response.status} ${response.statusText}\n`);
        process.stderr.write(`[DEBUG] Latency: ${latency}ms\n`);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        if (this.isDebugEnabled()) {
          const truncatedBody = errorBody.length > 1000 ? errorBody.slice(0, 1000) + '...' : errorBody;
          process.stderr.write(`[DEBUG] Body: ${truncatedBody}\n`);
          process.stderr.write(`[DEBUG] ---\x1B[39m\n`);
        }
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: errorBody,
          diagnostics: diag,
        };
      }

      if (stream && response.body) {
        if (this.isDebugEnabled()) {
          process.stderr.write(`[DEBUG] Body: <streaming>\n`);
          process.stderr.write(`[DEBUG] ---\x1B[39m\n`);
        }
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: response.body,
          diagnostics: diag,
        };
      }

      const text = await response.text();
      if (this.isDebugEnabled()) {
        const truncatedBody = text.length > 1000 ? text.slice(0, 1000) + '...' : text;
        process.stderr.write(`[DEBUG] Body: ${truncatedBody}\n`);
        process.stderr.write(`[DEBUG] ---\x1B[39m\n`);
      }
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
        diagnostics: diag,
      };
    } finally {
      clearTimeout(timeoutId);
      if (requestOptions?.signal && abortHandler) {
        requestOptions.signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  private enhanceError(err: Error, url: string, diag: ConnectionDiagnostics): LibreError {
    const cause = (err as any).cause;
    let extraInfo = cause instanceof Error ? `${cause.message} ${(cause as any).code || ''}` : String(cause || '');
    if (cause && Array.isArray(cause.errors)) {
       extraInfo += ' ' + cause.errors.map((e: any) => `${e.message} ${e.code}`).join(' ');
    }
    const msg = `${err.message} ${extraInfo}`;
    let code = 'HTTP_REQUEST_FAILED';
    let suggestion = 'Check request options or service endpoint status.';

    if (msg.includes('ENOTFOUND')) {
      code = 'DNS_LOOKUP_FAILED';
      suggestion = 'DNS resolution failed. Verify your network connection and base URL.';
    } else if (msg.includes('ECONNREFUSED')) {
      code = 'CONNECTION_REFUSED';
      suggestion = 'The host refused connection. Ensure the provider endpoint or local port is active.';
    } else if (msg.includes('ECONNRESET')) {
      code = 'CONNECTION_RESET';
      suggestion = 'The connection was reset. The server closed the socket prematurely.';
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      code = 'CONNECTION_TIMEOUT';
      suggestion = 'The connection timed out. Check network traffic or increase the timeout limit.';
    } else if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('SSL')) {
      code = 'SSL_ERROR';
      suggestion = 'SSL certificate verification failed. Check certificate validation settings.';
    } else if (msg.includes('401') || msg.includes('Unauthorized')) {
      code = 'AUTHENTICATION_FAILED';
      suggestion = 'Authentication failed. Please verify that your API key is correctly configured.';
    } else if (msg.includes('429') || msg.includes('rate limit')) {
      code = 'RATE_LIMIT_EXCEEDED';
      suggestion = 'You are being rate limited. Please cool down before making another request.';
    }

    const resultErr = new LibreError(
      code,
      'network',
      err.message,
      suggestion,
      `URL: ${url}\nDiagnostics: ${JSON.stringify(diag)}`,
      err
    );
    if ('statusCode' in err) {
      (resultErr as any).statusCode = (err as any).statusCode;
    }
    return resultErr;
  }
}

export function createHttpClient(config: {
  baseUrl: string;
  apiKey?: string;
  organization?: string;
  project?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  proxyUrl?: string;
  allowRetryOnNonIdempotent?: boolean;
}): HttpClient {
  return new HttpClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    organization: config.organization,
    project: config.project,
    customHeaders: config.customHeaders,
    timeout: config.timeout ?? 30000,
    maxRetries: config.maxRetries ?? 3,
    retryDelay: config.retryDelay ?? 1000,
    proxyUrl: config.proxyUrl,
    allowRetryOnNonIdempotent: config.allowRetryOnNonIdempotent,
  });
}
