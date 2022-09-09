import react from '@vitejs/plugin-react';
import { join } from 'path';
import { Alias, defineConfig, loadEnv } from 'vite';
import { getWorkspacePackageInfo } from '../../script/src/validate-monorepo/pnpm';
import setupProxy from './prodserver/setupProxy';

export default defineConfig(async (env) => {
  const workspacePackages = await getWorkspacePackageInfo(
    join(__dirname, '../..')
  );

  const envPrefix = 'REACT_APP_';
  const rootDotenvValues = loadEnv(env.mode, join(__dirname, '../..'), envPrefix);
  const coreDotenvValues = loadEnv(env.mode, __dirname, envPrefix)
  const processEnvDefines = [...Object.entries(rootDotenvValues), ...Object.entries(coreDotenvValues)].reduce<
    Record<string, string>
  >(
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
      'process.env.NODE_DEBUG': 'undefined',
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(process.version),

      // TODO: Replace these with the appropriate `import.meta.env` values.
      ...processEnvDefines,
    },

    resolve: {
      alias: [
        // Replace NodeJS built-in modules with polyfills.
        //
        // The trailing slash is important, otherwise it will be resolved as a
        // built-in NodeJS module.
        { find: 'buffer', replacement: require.resolve('buffer/'), },
        { find: 'path', replacement: require.resolve('path/'), },

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

      // Setup the proxy to local services, e.g. `smartcards`.
      {
        name: 'development-proxy',
        configureServer: (app) => {
          setupProxy(app.middlewares);
        },
      },
    ],

    // Pass some environment variables to the client in `import.meta.env`.
    envPrefix,
  };
});
