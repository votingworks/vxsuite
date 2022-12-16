import { join } from 'path';
import { getWorkspacePackagePaths } from '../pnpm';
import * as circleci from './circleci';
import * as pkgs from './packages';
import * as tsconfig from './tsconfig';
import { flatten, readdir } from './util';

export type ValidationIssue =
  | pkgs.ValidationIssue
  | tsconfig.ValidationIssue
  | circleci.ValidationIssue;

export async function* validateMonorepo(): AsyncGenerator<ValidationIssue> {
  const root = join(__dirname, '../../../..');
  const apps = await readdir(join(root, 'apps'));
  const appPackages = (await Promise.all(apps.map(readdir))).flat();
  const services = await readdir(join(root, 'services'));
  const frontends = await readdir(join(root, 'frontends'));
  const libs = await readdir(join(root, 'libs'));
  const packages = [...services, ...frontends, ...libs, ...appPackages];

  yield* pkgs.checkConfig({ packages: [root, ...packages] });
  yield* tsconfig.checkConfig({ packages });

  const circleCiConfigPath = join(root, '.circleci/config.yml');
  const circleCiConfig = await circleci.loadConfig(circleCiConfigPath);

  yield* circleci.checkConfig(
    circleCiConfig,
    circleCiConfigPath,
    await getWorkspacePackagePaths(root)
  );
}
