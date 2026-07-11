import * as dns from 'node:dns';
import { type ConnectionDiagnostics } from 'librecode-types';

export interface HttpClientOptions {
  baseUrl: string;
  apiKey?: string;
  organization?: string;
  project?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  proxyUrl?: string;
  preferIpv4?: boolean;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
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

function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
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

function classifyError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const errObj = parsed['error'] as Record<string, unknown> | undefined;
    if (errObj) {
      const msg = String(errObj['message'] ?? '');
      const code = String(errObj['code'] ?? '');
      const type = String(errObj['type'] ?? '');

      if (status === 401) {
        if (msg.includes('invalid')) return `Invalid API key: ${msg}`;
        if (code === 'invalid_api_key') return 'Invalid API key. Check your API key and try again.';
        return `Authentication failed (HTTP 401): ${msg}`;
      }
      if (status === 403) return `Access forbidden (HTTP 403): ${msg}`;
      if (status === 404) {
        if (type === 'model_not_found' || code === 'model_not_found') {
          return `Model not found: ${msg}`;
        }
        return `Endpoint not found (HTTP 404): ${msg}. Check the base URL.`;
      }
      if (status === 429) return `Rate limit exceeded. ${msg}`;
      if (status >= 500) return `Server error (HTTP ${status}): ${msg}`;
      return msg;
    }
    return body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
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

async function dnsLookup(hostname: string, _preferIpv4: boolean): Promise<ConnectionDiagnostics> {
  const diag: ConnectionDiagnostics = {};
  try {
    const addresses = await dns.promises.resolve4(hostname);
    diag.dnsLookup = `${hostname} -> ${addresses.join(', ')}`;
  } catch (err) {
    diag.dnsLookup = `${hostname} -> DNS failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  return diag;
}

export class HttpClient {
  private options: HttpClientOptions;
  private baseUrl: URL;

  constructor(options: HttpClientOptions) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...options,
    };
    this.baseUrl = new URL(options.baseUrl);
  }

  async request(method: string, path: string, body?: unknown, stream?: boolean): Promise<HttpResponse> {
    const url = new URL(path, this.baseUrl);
    const hostname = url.hostname;
    const diag: ConnectionDiagnostics = {};

    const retryPolicy: RetryPolicy = {
      maxRetries: this.options.maxRetries ?? DEFAULT_RETRY.maxRetries,
      baseDelayMs: this.options.retryDelay ?? DEFAULT_RETRY.baseDelayMs,
      maxDelayMs: DEFAULT_RETRY.maxDelayMs,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(
            retryPolicy.baseDelayMs * Math.pow(2, attempt - 1),
            retryPolicy.maxDelayMs,
          );
          await sleep(delay);
        }

        if (attempt === 0) {
          const dnsDiag = await dnsLookup(hostname, this.options.preferIpv4 ?? false);
          Object.assign(diag, dnsDiag);
        }

        const result = await this.doFetch(method, url, diag, body, stream);

        if (!stream && result.status >= 200 && result.status < 300) {
          result.diagnostics = diag;
          return result;
        }

        if (!stream && result.status >= 400) {
          if (RETRYABLE_STATUSES.has(result.status) && attempt < retryPolicy.maxRetries) {
            lastError = new Error(`HTTP ${result.status}: ${result.body.slice(0, 100)}`);
            continue;
          }
          const errorMsg = classifyError(result.status, result.body);
          lastError = new Error(errorMsg);
          (lastError as Error & { statusCode?: number }).statusCode = result.status;
          throw lastError;
        }

        result.diagnostics = diag;
        return result;
      } catch (err) {
        if (err instanceof Error) {
          if (isRetryableError(err) && attempt < retryPolicy.maxRetries) {
            lastError = err;
            continue;
          }
          throw this.enhanceError(err, url.toString(), diag);
        }
        throw err;
      }
    }

    throw this.enhanceError(
      lastError ?? new Error(`Request failed after ${retryPolicy.maxRetries} retries`),
      url.toString(),
      diag,
    );
  }

  private async doFetch(
    method: string,
    url: URL,
    diag: ConnectionDiagnostics,
    body?: unknown,
    _stream?: boolean,
  ): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'librecode/0.2.1',
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
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout ?? 30000);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      diag.httpStatus = response.status;
      diag.contentType = response.headers.get('content-type') ?? undefined;

      const text = await response.text();
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
        diagnostics: diag,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${(this.options.timeout ?? 30000) / 1000}s: ${url.toString()}`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private enhanceError(err: Error, url: string, diag: ConnectionDiagnostics): Error {
    const msg = err.message;

    if (msg.includes('ENOTFOUND') || diag.dnsLookup?.includes('DNS failed')) {
      const hostname = getHostname(url);
      return new Error(
        `DNS lookup failed for ${hostname}. Check the base URL and your internet connection.\n` +
        `  URL: ${url}\n` +
        `  Detail: ${msg}`,
      );
    }

    if (msg.includes('ECONNREFUSED')) {
      const hostname = getHostname(url);
      const port = getPort(url);
      return new Error(
        `Connection refused: ${hostname}:${port}. The server may be down or not accepting connections.\n` +
        `  URL: ${url}\n` +
        `  Detail: Make sure the service is running and the port is correct.`,
      );
    }

    if (msg.includes('ECONNRESET')) {
      return new Error(
        `Connection reset by peer. The server closed the connection unexpectedly.\n` +
        `  URL: ${url}\n` +
        `  Detail: ${msg}`,
      );
    }

    if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      const hostname = getHostname(url);
      return new Error(
        `Connection timed out: ${hostname}. The server is not responding.\n` +
        `  URL: ${url}\n` +
        `  Detail: Check your network connection or increase the timeout.`,
      );
    }

    if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('SSL')) {
      return new Error(
        `SSL certificate error. The server's SSL certificate is invalid.\n` +
        `  URL: ${url}\n` +
        `  Detail: ${msg}`,
      );
    }

    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Authentication')) {
      return new Error(
        `Authentication failed. Check your API key.\n` +
        `  URL: ${url}\n` +
        `  Detail: ${msg}`,
      );
    }

    if (msg.includes('429') || msg.includes('rate limit')) {
      return new Error(
        `Rate limit exceeded. Try again later.\n` +
        `  URL: ${url}\n` +
        `  Detail: ${msg}`,
      );
    }

    const statusMatch = msg.match(/HTTP (\d+)/);
    if (statusMatch) {
      return new Error(
        `HTTP ${statusMatch[1]} error from server.\n` +
        `  URL: ${url}\n` +
        `  Detail: ${msg}`,
      );
    }

    return new Error(
      `Request failed.\n  URL: ${url}\n  Detail: ${msg}`,
    );
  }
}

export function createHttpClient(config: {
  baseUrl: string;
  apiKey?: string;
  organization?: string;
  project?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
}): HttpClient {
  return new HttpClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    organization: config.organization,
    project: config.project,
    customHeaders: config.customHeaders,
    timeout: config.timeout ?? 30000,
    maxRetries: 3,
    retryDelay: 1000,
  });
}
