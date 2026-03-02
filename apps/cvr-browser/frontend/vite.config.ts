import react from '@vitejs/plugin-react';
import { join } from 'node:path';
import { Alias, defineConfig } from 'vite';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';

export default defineConfig(() => {
  const workspacePackages = getWorkspacePackageInfo(join(__dirname, '../..'));

  return {
    build: {
      outDir: 'build',
      minify: false,
    },

    define: {
      'process.env.NODE_DEBUG': JSON.stringify(undefined),
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(process.version),
    },

    resolve: {
      alias: [
        { find: 'assert', replacement: require.resolve('assert/') },
        { find: 'node:assert', replacement: require.resolve('assert/') },
        { find: 'buffer', replacement: require.resolve('buffer/') },
        { find: 'node:buffer', replacement: require.resolve('buffer/') },
        { find: 'events', replacement: require.resolve('events/') },
        { find: 'node:events', replacement: require.resolve('events/') },
        { find: 'fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        { find: 'node:fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        {
          find: 'node:fs/promises',
          replacement: join(__dirname, './src/stubs/fs.ts'),
        },
        { find: 'glob', replacement: join(__dirname, './src/stubs/glob.ts') },
        {
          find: 'jsdom',
          replacement: join(__dirname, './src/stubs/jsdom.ts'),
        },
        { find: 'os', replacement: join(__dirname, './src/stubs/os.ts') },
        { find: 'node:os', replacement: join(__dirname, './src/stubs/os.ts') },
        { find: 'path', replacement: require.resolve('path/') },
        { find: 'node:path', replacement: require.resolve('path/') },
        {
          find: 'stream',
          replacement: require.resolve('stream-browserify'),
        },
        {
          find: 'node:stream',
          replacement: require.resolve('stream-browserify'),
        },
        { find: 'util', replacement: require.resolve('util/') },
        { find: 'node:util', replacement: require.resolve('util/') },
        {
          find: 'zlib',
          replacement: require.resolve('browserify-zlib'),
        },
        {
          find: 'node:zlib',
          replacement: require.resolve('browserify-zlib'),
        },

        ...Array.from(workspacePackages.values()).reduce<Alias[]>(
          (aliases, { path, name, source }) =>
            !source
              ? aliases
              : [...aliases, { find: name, replacement: join(path, source) }],
          []
        ),
      ],
    },

    plugins: [react()],

    server: {
      port: Number(process.env.FRONTEND_PORT || 3100),
      strictPort: true,
    },
  };
});
