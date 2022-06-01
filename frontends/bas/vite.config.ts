import { join } from 'path';
import { defineConfig } from 'vite';
import setupProxy from './prodserver/setupProxy';
import { getWorkspacePackageInfo } from '../../script/src/validate-monorepo/pnpm';

export default defineConfig(async () => {
  const workspacePackages = await getWorkspacePackageInfo(
    join(__dirname, '../..')
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
    },

    resolve: {
      alias: {
        // Replace NodeJS built-in modules with polyfills.
        //
        // The trailing slash is important, otherwise it will be resolved as a
        // built-in NodeJS module.
        buffer: require.resolve('buffer/'),

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
        ...Array.from(workspacePackages.values()).reduce<
          Record<string, string>
        >(
          (aliases, { path, name, source }) =>
            !source ? aliases : { ...aliases, [name]: join(path, source) },
          {}
        ),
      },
    },

    plugins: [
      // Setup the proxy to local services, e.g. `smartcards`.
      {
        name: 'development-proxy',
        configureServer: (app) => {
          setupProxy(app.middlewares);
        },
      },
    ],
  };
});
