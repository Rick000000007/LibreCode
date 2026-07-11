import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('HttpClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getOptions returns idempotent retry config', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client1 = new HttpClient({ baseUrl: 'https://api.example.com/v1' });
    expect(client1.getOptions().allowRetryOnNonIdempotent).toBe(false);

    const client2 = new HttpClient({ baseUrl: 'https://api.example.com/v1', allowRetryOnNonIdempotent: true });
    expect(client2.getOptions().allowRetryOnNonIdempotent).toBe(true);
  });

  it('accepts allowRetryOnNonIdempotent option', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({
      baseUrl: 'https://api.example.com/v1',
      allowRetryOnNonIdempotent: true,
      maxRetries: 1,
      retryDelay: 1,
    });
    const opts = client.getOptions();
    expect(opts.allowRetryOnNonIdempotent).toBe(true);
    expect(opts.maxRetries).toBe(1);
  });

  it('getApiKey returns the configured API key', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test' });
    expect(client.getApiKey()).toBe('sk-test');
  });

  it('getApiKey returns undefined when not configured', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({ baseUrl: 'https://api.example.com/v1' });
    expect(client.getApiKey()).toBeUndefined();
  });

  it('constructs with default options', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({ baseUrl: 'https://api.example.com/v1' });
    const opts = client.getOptions();
    expect(opts.timeout).toBe(30000);
    expect(opts.maxRetries).toBe(3);
    expect(opts.retryDelay).toBe(1000);
    expect(opts.allowRetryOnNonIdempotent).toBe(false);
  });

  it('constructs with custom timeout', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({ baseUrl: 'https://api.example.com/v1', timeout: 10000 });
    const opts = client.getOptions();
    expect(opts.timeout).toBe(10000);
  });

  it('accepts customHeaders option', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({
      baseUrl: 'https://api.example.com/v1',
      customHeaders: { 'X-Custom': 'value' },
    });
    const opts = client.getOptions();
    expect(opts.customHeaders).toEqual({ 'X-Custom': 'value' });
  });

  it('accepts proxyUrl option', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({
      baseUrl: 'https://api.example.com/v1',
      proxyUrl: 'http://proxy:8080',
    });
    const opts = client.getOptions();
    expect(opts.proxyUrl).toBe('http://proxy:8080');
  });

  it('accepts org and project options', async () => {
    const { HttpClient } = await import('../http-client.js');
    const client = new HttpClient({
      baseUrl: 'https://api.example.com/v1',
      organization: 'my-org',
      project: 'my-project',
    });
    const opts = client.getOptions();
    expect(opts.organization).toBe('my-org');
    expect(opts.project).toBe('my-project');
  });
});

describe('createHttpClient', () => {
  it('creates an HttpClient with default retry config', async () => {
    const { createHttpClient } = await import('../http-client.js');
    const client = createHttpClient({ baseUrl: 'https://api.example.com/v1' });
    expect(client.getOptions().maxRetries).toBe(3);
    expect(client.getOptions().retryDelay).toBe(1000);
  });

  it('propagates proxyUrl and allowRetryOnNonIdempotent', async () => {
    const { createHttpClient } = await import('../http-client.js');
    const client = createHttpClient({
      baseUrl: 'https://api.example.com/v1',
      proxyUrl: 'http://proxy:8080',
      allowRetryOnNonIdempotent: true,
    });
    expect(client.getOptions().proxyUrl).toBe('http://proxy:8080');
    expect(client.getOptions().allowRetryOnNonIdempotent).toBe(true);
  });
});
