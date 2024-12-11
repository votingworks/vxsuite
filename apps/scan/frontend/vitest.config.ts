import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';

const workspaceRootPath = join(__dirname, '../../..');
const workspacePackages = getWorkspacePackageInfo(workspaceRootPath);

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],

    coverage: {
      thresholds: {
        lines: 94,
        branches: 84,
      },
      exclude: [
        'src/config/*',
        'src/**/*.d.ts',
        'src/index.tsx',
        'src/stubs/*',
      ],
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
    alias: Array.from(workspacePackages.values())
      .reduce<{ find: string; replacement: string }[]>(
        (aliases, { path, name, source }) =>
          !source
            ? aliases
            : [...aliases, { find: name, replacement: join(path, source) }],
        []
      )
      // TODO vitest is noticeably slower when using the full list of aliases,
      // but we really only need `@votingworks/ui` for the tests to run
      // correctly. This is a temporary workaround until we can figure out why
      // the full list of aliases is causing performance issues.
      .filter((alias) => alias.find === '@votingworks/ui'),
  },
});
