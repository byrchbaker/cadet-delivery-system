import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/test/**/*.test.ts'], pool: 'forks', testTimeout: 20000 },
});
