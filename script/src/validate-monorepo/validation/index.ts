import { join } from 'node:path';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';
import * as cargo from './cargo';
import * as circleci from './circleci';
import * as pkgs from './packages';
import * as tsconfig from './tsconfig';
import * as turbo from './turbo';
import { readFile } from 'node:fs/promises';

export type ValidationIssue =
  | pkgs.ValidationIssue
  | tsconfig.ValidationIssue
  | circleci.ValidationIssue
  | cargo.ValidationIssue
  | turbo.ValidationIssue;

export async function* validateMonorepo(): AsyncGenerator<ValidationIssue> {
  const root = join(__dirname, '../../../..');
  const workspacePackages = getWorkspacePackageInfo(root);
  const nodeVersionFile = (
    await readFile(join(root, '.node-version'), 'utf8')
  ).trim();

  yield* pkgs.checkConfig({
    pinnedPackages: [
      // Pin all packages by default:
      '*',

      // Pin a package:
      // 'pkg-to-pin',

      // Using a glob to pin many packages:
      // '@types/*',

      // Exclude a package:
      // '!pkg-to-exclude',

      // Exclude vitest while upgrading v2 to v3
      '!vitest',
      '!@vitest/coverage-istanbul',
    ],
    workspacePackages,
    nodeVersionFile,
  });
  yield* pkgs.checkPackageJsonIsExported({ workspacePackages });
  yield* pkgs.checkTaskDelegation({ workspacePackages });
  yield* tsconfig.checkConfig(workspacePackages);
  yield* circleci.checkConfig(workspacePackages);
  yield* cargo.checkConfig(root);
  yield* turbo.checkConfig(root, workspacePackages);
}
