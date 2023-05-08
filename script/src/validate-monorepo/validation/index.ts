import { join } from 'path';
import { getWorkspacePackageInfo } from '../pnpm';
import * as circleci from './circleci';
import * as pkgs from './packages';
import * as tsconfig from './tsconfig';
import { readdir } from './util';

export type ValidationIssue =
  | pkgs.ValidationIssue
  | tsconfig.ValidationIssue
  | circleci.ValidationIssue;

export async function* validateMonorepo(): AsyncGenerator<ValidationIssue> {
  const root = join(__dirname, '../../../..');
  const apps = await readdir(join(root, 'apps'));
  const appPackages = (await Promise.all(apps.map(readdir))).flat();
  const services = await readdir(join(root, 'services'));
  const libs = await readdir(join(root, 'libs'));
  const packages = [...services, ...libs, ...appPackages];
  const workspacePackages = await getWorkspacePackageInfo(root);

  yield* pkgs.checkConfig({
    packages: [root, ...packages],
    // It's important that these packages are pinned to a specific version.
    // Otherwise, we can end up with multiple versions of the same package
    // in the same monorepo, which can cause issues. For example, if we
    // have two versions of React, then we can end up with two copies of
    // the React context, which can cause issues. Or if we have two
    // versions of TypeScript, we can have code flagged as an error by
    // one version of TypeScript, but not the other.
    pinnedPackages: [
      '@types/node',
      '@typescript-eslint/eslint-plugin',
      '@typescript-eslint/parser',
      'eslint',
      'fast-check',
      'prettier',
      'react',
      'react-dom',
      'typescript',
    ],
    workspacePackages,
  });
  yield* tsconfig.checkConfig({ workspacePackages });

  const circleCiConfigPath = join(root, '.circleci/config.yml');
  const circleCiConfig = await circleci.loadConfig(circleCiConfigPath);

  yield* circleci.checkConfig(
    circleCiConfig,
    circleCiConfigPath,
    await getWorkspacePackageInfo(root)
  );
}
