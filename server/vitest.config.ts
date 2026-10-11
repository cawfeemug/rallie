import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The first run downloads a MongoDB binary for mongodb-memory-server, so be generous.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
