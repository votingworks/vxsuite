import * as path from 'path';
import { Alias, mergeConfig, InlineConfig } from 'vite';
import { StorybookConfig } from '@storybook/react-vite';

import { getWorkspacePackageInfo } from '../../../script/src/validate-monorepo/pnpm';

const config: StorybookConfig = {
  stories: ['../src/*.stories.@(ts|tsx)'],
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
    const workspacePackages = await getWorkspacePackageInfo(
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
          { find: 'buffer', replacement: require.resolve('buffer/'), },
          { find: 'path', replacement: require.resolve('path/'), },

          // Create aliases for all workspace packages, i.e.
          //
          //   {
          //     '@votingworks/types': '…/libs/types/src/index.ts',
          //     '@votingworks/shared': '…/libs/shared/src/index.ts',
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
