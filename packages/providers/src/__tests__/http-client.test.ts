import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HttpClient, createHttpClient } from '../http-client.js';
import * as dns from 'node:dns';

vi.mock('node:dns', () => ({
  promises: {
    resolve: vi.fn().mockResolvedValue(['1.1.1.1']),
    resolve4: vi.fn().mockResolvedValue(['1.1.1.1']),
  },
}));

describe('HttpClient', () => {
  const baseUrl = 'https://api.example.com/v1';
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Basic Configuration', () => {
    it('constructs with default options', () => {
      const client = new HttpClient({ baseUrl });
      const opts = client.getOptions();
      expect(opts.timeout).toBe(30000);
      expect(opts.maxRetries).toBe(3);
      expect(opts.retryDelay).toBe(1000);
      expect(opts.allowRetryOnNonIdempotent).toBe(false);
    });

    it('accepts custom options', () => {
      const client = new HttpClient({ 
        baseUrl, 
        timeout: 10000, 
        maxRetries: 5, 
        retryDelay: 500, 
        allowRetryOnNonIdempotent: true 
      });
      const opts = client.getOptions();
      expect(opts.timeout).toBe(10000);
      expect(opts.maxRetries).toBe(5);
      expect(opts.retryDelay).toBe(500);
      expect(opts.allowRetryOnNonIdempotent).toBe(true);
    });

    it('getApiKey returns configured key', () => {
      const client = new HttpClient({ baseUrl, apiKey: 'sk-test' });
      expect(client.getApiKey()).toBe('sk-test');
    });
  });

  describe('Request Execution & Retries', () => {
    it('returns successful response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ result: 'ok' }),
      });

      const client = new HttpClient({ baseUrl });
      const res = await client.request('GET', '/test');
      expect(res.status).toBe(200);
      expect(res.body).toBe(JSON.stringify({ result: 'ok' }));
    });

    it('retries idempotent methods (GET) on 500 error', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          text: async () => 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => 'Success',
        });
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ baseUrl, maxRetries: 1, retryDelay: 1 });
      const res = await client.request('GET', '/test');
      
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(200);
    });

    it('does NOT retry non-idempotent methods (POST) on 500 error by default', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => 'Internal Server Error',
      });
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ baseUrl, maxRetries: 1, retryDelay: 1 });
      
      const result = await client.request('POST', '/test', { data: 'val' });
      expect(result.status).toBe(500);
      expect(result.body).toBe('Internal Server Error');
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries non-idempotent methods (POST) when allowRetryOnNonIdempotent is true', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          text: async () => 'Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => 'Success',
        });
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ baseUrl, maxRetries: 1, retryDelay: 1, allowRetryOnNonIdempotent: true });
      const res = await client.request('POST', '/test', { data: 'val' });
      
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(200);
    });

    it('retries on HTTP 429 (Rate Limit)', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers(),
          text: async () => 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => 'Success',
        });
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ baseUrl, maxRetries: 1, retryDelay: 1 });
      const res = await client.request('GET', '/test');
      
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(200);
    });

    it('stops retrying after maxRetries is reached', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => 'Persistent Error',
      });
      globalThis.fetch = fetchMock;

      const client = new HttpClient({ baseUrl, maxRetries: 2, retryDelay: 1 });
      const result = await client.request('GET', '/test');
      expect(result.status).toBe(500);
      expect(result.body).toBe('Persistent Error');
      
      // 1 initial + 2 retries = 3 calls
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('Streaming', () => {
    it('returns a ReadableStream when stream: true', async () => {
      const mockStream = new ReadableStream();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: mockStream,
      });

      const client = new HttpClient({ baseUrl });
      const res = await client.request('GET', '/test', undefined, true);
      
      expect(res.body).toBeInstanceOf(ReadableStream);
    });

    it('returns buffered text even when stream: true if response is not ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => 'Unauthorized Access',
      });

      const client = new HttpClient({ baseUrl });
      // The request method returns the non-2xx response so the caller can
      // convert it to the appropriate error type via handleError().
      const result = await client.request('GET', '/test', undefined, true);
      expect(result.status).toBe(401);
      expect(result.body).toBe('Unauthorized Access');
    });
  });

  describe('Network & DNS', () => {
    it('handles request timeouts', async () => {
      const abortError = new Error('The operation was aborted');
      (abortError as any).name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const client = new HttpClient({ baseUrl, timeout: 10 });
      await expect(client.request('GET', '/test')).rejects.toThrow(/Request timeout|aborted/i);
    }, 10000);

    it('handles DNS resolution based on preferIpv4', async () => {
      const resolveMock = vi.mocked(dns.promises.resolve);
      const resolve4Mock = vi.mocked(dns.promises.resolve4);
      
      resolveMock.mockResolvedValue(['1.1.1.1']);
      resolve4Mock.mockResolvedValue(['1.1.1.1']);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => 'ok',
      });

      const clientV4 = new HttpClient({ baseUrl, preferIpv4: true });
      await clientV4.request('GET', '/test');
      expect(resolve4Mock).toHaveBeenCalled();

      const clientAny = new HttpClient({ baseUrl, preferIpv4: false });
      await clientAny.request('GET', '/test');
      expect(resolveMock).toHaveBeenCalled();
    });
  });

  describe('Error Enhancement', () => {
    it('preserves statusCode and cause in enhanced errors', async () => {
      const originalError = new Error('Network Failure');
      (originalError as any).statusCode = 503;
      
      globalThis.fetch = vi.fn().mockRejectedValue(originalError);

      const client = new HttpClient({ baseUrl, maxRetries: 0 });
      try {
        await client.request('GET', '/test');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.cause).toBe(originalError);
      }
    }, 10000);
  });
});

describe('createHttpClient', () => {
  it('correctly propagates retry options', () => {
    const client = createHttpClient({ 
      baseUrl: 'https://api.example.com/v1', 
      maxRetries: 10, 
      retryDelay: 200 
    });
    const opts = client.getOptions();
    expect(opts.maxRetries).toBe(10);
    expect(opts.retryDelay).toBe(200);
  });
});