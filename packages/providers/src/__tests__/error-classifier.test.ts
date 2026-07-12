import { describe, it, expect } from 'vitest';
import { classifyError, isNetworkError, isAuthError, isRateLimitError } from '../error-classifier.js';

describe('classifyError', () => {
  it('returns invalid API key message for 401 with invalid msg', () => {
    const body = JSON.stringify({ error: { message: 'invalid API key', code: 'invalid_api_key' } });
    expect(classifyError(401, body)).toContain('Invalid API key');
  });

  it('handles 403 with access forbidden', () => {
    const body = JSON.stringify({ error: { message: 'forbidden' } });
    expect(classifyError(403, body)).toContain('Access forbidden');
  });

  it('handles 404 with model_not_found', () => {
    const body = JSON.stringify({ error: { type: 'model_not_found', message: 'gpt-4o not found' } });
    expect(classifyError(404, body)).toContain('Model not found');
  });

  it('handles 404 generic endpoint not found', () => {
    const body = JSON.stringify({ error: { message: 'not found' } });
    expect(classifyError(404, body)).toContain('Endpoint not found');
  });

  it('handles 429 rate limit', () => {
    const body = JSON.stringify({ error: { message: 'too many requests' } });
    expect(classifyError(429, body)).toContain('Rate limit exceeded');
  });

  it('handles 500 server error', () => {
    const body = JSON.stringify({ error: { message: 'internal error' } });
    expect(classifyError(500, body)).toContain('Server error (HTTP 500)');
  });

  it('handles malformed JSON body', () => {
    expect(classifyError(400, 'not json')).toBe('not json');
  });

  it('handles body without error object', () => {
    const body = JSON.stringify({ detail: 'something broke' });
    expect(classifyError(400, body)).toContain('something broke');
  });

  it('handles primitive error value (string) instead of object', () => {
    const body = JSON.stringify({ error: 'Critical failure' });
    expect(classifyError(500, body)).toBe('{"error":"Critical failure"}');
  });

  it('handles null error value', () => {
    const body = JSON.stringify({ error: null });
    expect(classifyError(500, body)).toBe('{"error":null}');
  });

  it('truncates long non-error bodies', () => {
    const longBody = 'a'.repeat(300);
    expect(classifyError(400, longBody)).toHaveLength(200);
  });
});

describe('isNetworkError', () => {
  it('detects ECONNREFUSED', () => {
    expect(isNetworkError(new Error('ECONNREFUSED connection refused'))).toBe(true);
  });

  it('detects ECONNRESET', () => {
    expect(isNetworkError(new Error('ECONNRESET socket reset'))).toBe(true);
  });

  it('detects ETIMEDOUT', () => {
    expect(isNetworkError(new Error('ETIMEDOUT timed out'))).toBe(true);
  });

  it('detects ENOTFOUND', () => {
    expect(isNetworkError(new Error('ENOTFOUND getaddrinfo'))).toBe(true);
  });

  it('detects socket hang up', () => {
    expect(isNetworkError(new Error('socket hang up'))).toBe(true);
  });

  it('returns false for non-network errors', () => {
    expect(isNetworkError(new Error('invalid request'))).toBe(false);
  });
});

describe('isAuthError', () => {
  it('detects 401 message', () => {
    expect(isAuthError(new Error('HTTP 401 Unauthorized'))).toBe(true);
  });

  it('detects unauthorized', () => {
    expect(isAuthError(new Error('Unauthorized'))).toBe(true);
  });

  it('detects authentication failed', () => {
    expect(isAuthError(new Error('Authentication failed'))).toBe(true);
  });

  it('detects invalid API key', () => {
    expect(isAuthError(new Error('Invalid API key'))).toBe(true);
  });

  it('returns false for non-auth errors', () => {
    expect(isAuthError(new Error('not found'))).toBe(false);
  });
});

describe('isRateLimitError', () => {
  it('detects 429 message', () => {
    expect(isRateLimitError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
  });

  it('detects rate limit message', () => {
    expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('detects too many requests', () => {
    expect(isRateLimitError(new Error('too many requests'))).toBe(true);
  });

  it('returns false for non-rate-limit errors', () => {
    expect(isRateLimitError(new Error('server error'))).toBe(false);
  });
});
