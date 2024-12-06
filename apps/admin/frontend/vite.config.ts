import react from '@vitejs/plugin-react';
import { join } from 'node:path';
import { Alias, defineConfig, loadEnv } from 'vite';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';
import setupProxy from './prodserver/setupProxy';

export default defineConfig((env) => {
  const workspacePackages = getWorkspacePackageInfo(join(__dirname, '../..'));

  const envPrefix = 'REACT_APP_';
  const rootDotenvValues = loadEnv(
    env.mode,
    join(__dirname, '../../..'),
    envPrefix
  );
  const coreDotenvValues = loadEnv(env.mode, __dirname, envPrefix);
  const processEnvDefines = [
    ...Object.entries(rootDotenvValues),
    ...Object.entries(coreDotenvValues),
  ].reduce<Record<string, string>>(
    (acc, [key, value]) => ({
      ...acc,
      [`process.env.${key}`]: JSON.stringify(value),
    }),
    {}
  );

  return {
    build: {
      // Write build files to `build` directory.
      outDir: 'build',

      // Do not minify build files. We don't need the space savings and this is
      // a minor transparency improvement.
      minify: false,
    },

    // Replace some code in Node modules, `#define`-style, to avoid referencing
    // Node-only globals like `process`.
    define: {
      'process.env.NODE_DEBUG': JSON.stringify(undefined),
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(process.version),

      // TODO: Replace these with the appropriate `import.meta.env` values (#1907).
      ...processEnvDefines,
    },

    resolve: {
      alias: [
        // Replace NodeJS built-in modules with polyfills.
        //
        // The trailing slash is important for the ones with the same name.
        // Without it, they will be resolved as built-in NodeJS modules.
        { find: 'assert', replacement: require.resolve('assert/') },
        { find: 'node:assert', replacement: require.resolve('assert/') },
        { find: 'buffer', replacement: require.resolve('buffer/') },
        { find: 'node:buffer', replacement: require.resolve('buffer/') },
        { find: 'events', replacement: require.resolve('events/') },
        { find: 'node:events', replacement: require.resolve('events/') },
        { find: 'fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        { find: 'node:fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        { find: 'jsdom', replacement: join(__dirname, './src/stubs/jsdom.ts') },
        { find: 'path', replacement: require.resolve('path/') },
        { find: 'node:path', replacement: require.resolve('path/') },
        { find: 'os', replacement: join(__dirname, './src/stubs/os.ts') },
        { find: 'node:os', replacement: join(__dirname, './src/stubs/os.ts') },
        { find: 'stream', replacement: require.resolve('stream-browserify') },
        {
          find: 'node:stream',
          replacement: require.resolve('stream-browserify'),
        },
        { find: 'util', replacement: require.resolve('util/') },
        { find: 'node:util', replacement: require.resolve('util/') },
        { find: 'zlib', replacement: require.resolve('browserify-zlib') },
        { find: 'node:zlib', replacement: require.resolve('browserify-zlib') },

        // Work around an internet curmudgeon.
        // Problem: https://github.com/isaacs/node-glob/pull/374
        // Fix: https://github.com/isaacs/node-glob/pull/479
        { find: 'glob', replacement: join(__dirname, './src/stubs/glob.ts') },

        // Create aliases for all workspace packages, i.e.
        //
        //   {
        //     '@votingworks/types': '…/libs/types/src/index.ts',
        //     '@votingworks/utils': '…/libs/utils/src/index.ts',
        //      …
        //   }
        //
        // This allows re-mapping imports for workspace packages to their
        // TypeScript source code rather than the built JavaScript.
        ...Array.from(workspacePackages.values()).reduce<Alias[]>(
          (aliases, { path, name, source }) =>
            !source
              ? aliases
              : [...aliases, { find: name, replacement: join(path, source) }],
          []
        ),
      ],
    },

    plugins: [
      react(),

      // Setup the proxy to local services.
      {
        name: 'development-proxy',
        configureServer: (app) => {
          setupProxy(app.middlewares);
        },
      },
    ],

    server: {
      port: 3000,
    },

    // Pass some environment variables to the client in `import.meta.env`.
    envPrefix,
  };
});
