import { join } from 'node:path';
import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/expect.ts'],
    coverage: {
      exclude: ['src/v3.ts'],
    },
  },
  root: join(__dirname, 'src/web'),

  // Replace some code in Node modules, `#define`-style, to avoid referencing
  // Node-only globals like `process`.
  define: {
    'process.env.NODE_DEBUG': 'undefined',
    'process.platform': JSON.stringify('browser'),
    'process.version': JSON.stringify(process.version),
  },
  resolve: {
    alias: [
      { find: 'buffer', replacement: require.resolve('buffer/') },
      { find: 'node:buffer', replacement: require.resolve('buffer/') },
      { find: 'util', replacement: require.resolve('util/') },
      { find: 'node:util', replacement: require.resolve('util/') },
      {
        find: '@votingworks/basics',
        replacement: join(__dirname, '../basics/src/index.ts'),
      },
      {
        find: '@votingworks/types',
        replacement: join(__dirname, '../types/src/index.ts'),
      },
    ],
  },
});
