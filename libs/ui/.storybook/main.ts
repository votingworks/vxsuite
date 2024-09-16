import * as path from 'node:path';
// @ts-expect-error - TS thinks there's an error with the module type but it works ok
import { Alias, mergeConfig, InlineConfig } from 'vite';
import { StorybookConfig } from '@storybook/react-vite';

import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {

    },
  },
  docs: {
    autodocs:'tag'
  },
  staticDirs: ['../.storybook-static'],
  async viteFinal(config: InlineConfig): Promise<InlineConfig> {
    const workspacePackages = getWorkspacePackageInfo(
      path.join(__dirname, '../..')
    );

    return mergeConfig(config, {
      // Replace some code in Node modules, `#define`-style, to avoid referencing
      // Node-only globals like `process`.
      define: {
        'process.env.NODE_DEBUG': 'undefined',
        'process.platform': JSON.stringify('browser'),
        'process.version': JSON.stringify(process.version),
      },
      resolve: {
        alias: [
          // Replace NodeJS built-in modules with polyfills.
          //
          // The trailing slash is important, otherwise it will be resolved as a
          // built-in NodeJS module.
          { find: 'assert', replacement: require.resolve('assert/') },
          { find: 'node:assert', replacement: require.resolve('assert/') },
          { find: 'buffer', replacement: require.resolve('buffer/'), },
          { find: 'node:buffer', replacement: require.resolve('buffer/'), },
          { find: 'events', replacement: require.resolve('events/') },
          { find: 'node:events', replacement: require.resolve('events/') },
          { find: 'fs', replacement: path.join(__dirname, '../src/stubs/fs.ts') },
          { find: 'node:fs', replacement: path.join(__dirname, '../src/stubs/fs.ts') },
          { find: 'jsdom', replacement: path.join(__dirname, '../src/stubs/jsdom.ts') },
          { find: 'os', replacement: path.join(__dirname, '../src/stubs/os.ts') },
          { find: 'node:os', replacement: path.join(__dirname, '../src/stubs/os.ts') },
          { find: 'path', replacement: require.resolve('path/'), },
          { find: 'node:path', replacement: require.resolve('path/'), },
          { find: 'stream', replacement: require.resolve('stream-browserify') },
          { find: 'node:stream', replacement: require.resolve('stream-browserify') },
          { find: 'util', replacement: require.resolve('util/') },
          { find: 'node:util', replacement: require.resolve('util/') },
          { find: 'zlib', replacement: require.resolve('browserify-zlib') },
          { find: 'node:zlib', replacement: require.resolve('browserify-zlib') },

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
            (aliases, p) =>
              !p.source
                ? aliases
                : [
                    ...aliases,
                    {
                      find: p.name,
                      replacement: path.join(p.path, p.source),
                    },
                  ],
            []
          ),
        ],
      },
    });
  },
};

module.exports = config;
