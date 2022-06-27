import { join } from 'path';
import { getWorkspacePackagePaths } from '../pnpm';
import * as circleci from './circleci';
import * as tsconfig from './tsconfig';
import { readdir } from './util';

export type ValidationIssue =
  | tsconfig.ValidationIssue
  | circleci.ValidationIssue;

export async function* validateMonorepo(): AsyncGenerator<ValidationIssue> {
  const root = join(__dirname, '../../../..');
  const services = await readdir(join(root, 'services'));
  const frontends = await readdir(join(root, 'frontends'));
  const libs = await readdir(join(root, 'libs'));
  const packages = [...services, ...frontends, ...libs];

  yield* tsconfig.checkConfig({
    packages,
  });

  const circleCiConfigPath = join(root, '.circleci/config.yml');
  const circleCiConfig = await circleci.loadConfig(circleCiConfigPath);

  yield* circleci.checkConfig(
    circleCiConfig,
    circleCiConfigPath,
    await getWorkspacePackagePaths(root)
  );
}
