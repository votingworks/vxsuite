import { join } from 'node:path';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';
import * as circleci from './circleci';
import * as pkgs from './packages';
import * as tsconfig from './tsconfig';

export type ValidationIssue =
  | pkgs.ValidationIssue
  | tsconfig.ValidationIssue
  | circleci.ValidationIssue;

export async function* validateMonorepo(): AsyncGenerator<ValidationIssue> {
  const root = join(__dirname, '../../../..');
  const workspacePackages = getWorkspacePackageInfo(root);

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
  });
  yield* tsconfig.checkConfig(workspacePackages);
  yield* circleci.checkConfig(workspacePackages);
}
