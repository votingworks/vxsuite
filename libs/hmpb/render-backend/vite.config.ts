import { join } from 'path';
import { Alias, defineConfig } from 'vite';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';

export default defineConfig(async (env) => {
  const workspaceRootPath = join(__dirname, '../../..');
  const workspacePackages = getWorkspacePackageInfo(workspaceRootPath);

  return {
    // Replace some code in Node modules, `#define`-style, to avoid referencing
    // Node-only globals like `process`.
    define: {
      'process.env.NODE_DEBUG': 'undefined',
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(process.version),

      // TODO: Replace these with the appropriate `import.meta.env` values.
      // ...processEnvDefines,
    },

    resolve: {
      alias: [
        // Replace NodeJS built-in modules with polyfills.
        //
        // The trailing slash is important, otherwise it will be resolved as a
        // built-in NodeJS module.
        { find: 'buffer', replacement: require.resolve('buffer/') },
        { find: 'fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        { find: 'os', replacement: join(__dirname, './src/stubs/os.ts') },
        { find: 'path', replacement: require.resolve('path/') },

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
  };
});
