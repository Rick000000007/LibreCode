import { describe, it, expect } from 'vitest';

describe('CLI Package', () => {
  it('package loads correctly', async () => {
    // Ensure the VITEST guard prevents main() from running
    process.env['VITEST'] = 'true';
    process.env['NODE_ENV'] = 'test';
    const mod = await import('../index.js');
    expect(mod).toBeDefined();
  }, 10000);
});
