export function classifyError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const errObj = parsed['error'];
    if (errObj !== null && typeof errObj === 'object') {
      const error = errObj as Record<string, unknown>;
      const msg = String(error['message'] ?? '').trim();
      const code = String(error['code'] ?? '').trim();
      const type = String(error['type'] ?? '').trim();

      if (status === 401) {
        if (msg && msg.includes('invalid')) return `Invalid API key: ${msg}`;
        if (code === 'invalid_api_key') return 'Invalid API key. Check your API key and try again.';
        return `Authentication failed (HTTP 401)${msg ? ': ' + msg : '. Check your API key.'}`;
      }
      if (status === 403) return `Access forbidden (HTTP 403)${msg ? ': ' + msg : ''}`;
      if (status === 404) {
        if (type === 'model_not_found' || code === 'model_not_found') {
          return `Model not found${msg ? ': ' + msg : ''}`;
        }
        return `Endpoint not found (HTTP 404)${msg ? ': ' + msg : ''}. Check the base URL.`;
      }
      if (status === 429) return `Rate limit exceeded.${msg ? ' ' + msg : ' Please wait and try again.'}`;
      if (status >= 500) return `Server error (HTTP ${status})${msg ? ': ' + msg : ''}`;
      return msg || `API error (HTTP ${status})${code ? ', code: ' + code : ''}${type ? ', type: ' + type : ''}`;
    }
    const trimmedBody = body.trim().slice(0, 200);
    return trimmedBody || `HTTP error ${status}`;
  } catch {
    const trimmedBody = body.trim().slice(0, 200);
    return trimmedBody || `HTTP error ${status}`;
  }
}

export function isNetworkError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('esocketerror') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('dns') ||
    msg.includes('enotfound')
  );
}

export function isAuthError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    msg.includes('api key') ||
    msg.includes('invalid key')
  );
}

export function isRateLimitError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests');
}
