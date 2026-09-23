import { join } from 'node:path';
import { getWorkspacePackageInfo } from '@votingworks/monorepo-utils';
import * as cargo from './cargo.ts';
import * as circleci from './circleci.ts';
import * as markdownLinks from './markdown_links.ts';
import * as pkgs from './packages.ts';
import * as tsconfig from './tsconfig.ts';
import * as turbo from './turbo.ts';
import { readFile } from 'node:fs/promises';

export type ValidationIssue =
  | pkgs.ValidationIssue
  | tsconfig.ValidationIssue
  | circleci.ValidationIssue
  | cargo.ValidationIssue
  | turbo.ValidationIssue
  | markdownLinks.ValidationIssue;

export async function* validateMonorepo(): AsyncGenerator<ValidationIssue> {
  const root = join(import.meta.dirname, '../../../..');
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
  yield* markdownLinks.checkLinks(root);
}
