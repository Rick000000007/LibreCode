import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.bench.ts'],
    testTimeout: 30000,
    environment: 'node',
  },
  bench: {
    include: ['src/**/*.bench.ts'],
  },
});
