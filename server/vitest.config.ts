import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 20000,
    // Keep uploads and backups from test runs out of the repo.
    env: { DATA_DIR: path.join(os.tmpdir(), 'cds-vitest') },
  },
});
