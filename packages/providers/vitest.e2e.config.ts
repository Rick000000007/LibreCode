import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 180000,
    hookTimeout: 60000,
    environment: 'node',
    globals: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    setupFiles: ['./src/__tests__/e2e/setup.ts'],
  },
});