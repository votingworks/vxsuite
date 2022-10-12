import chalk from 'chalk';
import { join, relative } from 'path';
import { Alias, defineConfig } from 'vite';
import { buildApp } from './src/backend/app';
import { getWorkspacePackageInfo } from '../../script/src/validate-monorepo/pnpm';
import { createWorkspace } from '@votingworks/scan';

/**
 * Configures the Vite build.
 */
export default defineConfig(async () => {
  const workspacePackages = await getWorkspacePackageInfo(
    join(__dirname, '../..')
  );

  const scanWorkspace = createWorkspace(
    process.env['SCAN_WORKSPACE'] ||
      join(__dirname, '../../services/scan/dev-workspace')
  );

  const relativeScanWorkspacePath = relative(process.cwd(), scanWorkspace.path);

  // eslint-disable-next-line no-console
  console.log(
    `${chalk.bold.yellow('scan-diagnostic')} @ ${chalk.underline(
      relativeScanWorkspacePath.length < scanWorkspace.path.length
        ? relativeScanWorkspacePath
        : scanWorkspace.path
    )}`
  );

  return {
    resolve: {
      alias: [
        // Replace NodeJS built-in modules with polyfills.
        //
        // The trailing slash is important for the ones with the same name.
        // Without it, they will be resolved as built-in NodeJS modules.
        { find: 'buffer', replacement: require.resolve('buffer/') },
        { find: 'fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        { find: 'jsdom', replacement: join(__dirname, './src/stubs/jsdom.ts') },
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

    define: {
      global: 'window',
      'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV']),
    },

    plugins: [
      {
        name: 'server',
        configureServer(server) {
          server.middlewares.use(buildApp(scanWorkspace));
        },
      },
    ],
  };
});
