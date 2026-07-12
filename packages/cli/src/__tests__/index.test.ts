import { describe, it, expect } from 'vitest';

describe('CLI Package', () => {
  it('package loads correctly', async () => {
    const mod = await import('../index.js');
    expect(mod).toBeDefined();
  });
});
