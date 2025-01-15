import { join } from 'node:path';
import { Alias, defineConfig } from 'vite';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';

export default defineConfig(async (env) => {
  const workspaceRootPath = join(__dirname, '../..');
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
        { find: 'node:buffer', replacement: require.resolve('buffer/') },
        {
          find: 'fs/promises',
          replacement: join(__dirname, './src/preview/stubs/fs.ts'),
        },
        {
          find: 'node:fs/promises',
          replacement: join(__dirname, './src/preview/stubs/fs.ts'),
        },
        {
          find: 'fs',
          replacement: join(__dirname, './src/preview/stubs/fs.ts'),
        },
        {
          find: 'node:fs',
          replacement: join(__dirname, './src/preview/stubs/fs.ts'),
        },
        {
          find: 'os',
          replacement: join(__dirname, './src/preview/stubs/os.ts'),
        },
        {
          find: 'node:os',
          replacement: join(__dirname, './src/preview/stubs/os.ts'),
        },
        { find: 'path', replacement: require.resolve('path/') },
        { find: 'node:path', replacement: require.resolve('path/') },
        { find: 'util', replacement: require.resolve('util/') },
        { find: 'node:util', replacement: require.resolve('util/') },

        // This is here to avoid loading the backend code in the browser.
        // See src/preview/hmpb_strings.tsx.
        {
          find: '@votingworks/backend/src/language_and_audio/hmpb_strings',
          replacement: join(
            workspacePackages.get('@votingworks/backend')!.path,
            'src/language_and_audio/hmpb_strings.ts'
          ),
        },

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
