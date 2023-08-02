/**
 * Moves package.json dependencies from devDependencies to dependencies or vice
 * versa. Currently supports applying to all packages at once. Specify the --dev
 * flag to move dependencies to devDependencies, or --prod to move them to
 * dependencies. Specify one or more glob patterns to match the dependencies.
 *
 * Run it like this:
 *
 *   codemods/bin/codemod-dep-type --dev ts-jest
 *
 * If you want to see what would be moved without actually moving it, run with
 * the --dry-run flag:
 *
 *
 */
import { promises as fs } from 'fs';
import { join } from 'path';
import { minimatch, MMRegExp } from 'minimatch';
import {
  getWorkspacePackageInfo,
  PackageJson,
} from '@votingworks/monorepo-utils';

export async function main(args: readonly string[]): Promise<number> {
  const monorepoRoot = join(__dirname, '../../..');
  const workspacePackageInfo = getWorkspacePackageInfo(monorepoRoot);

  // eslint-disable-next-line no-undef-init
  let targetType: undefined | 'dev' | 'prod' = undefined;
  const patterns: string[] = [];
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg.startsWith('-')) {
      if (arg === '--prod') {
        targetType = 'prod';
      } else if (arg === '--dev') {
        targetType = 'dev';
      } else if (arg === '--dry-run') {
        dryRun = true;
      } else {
        process.stderr.write(`Unknown option: "${arg}"\n`);
        return 1;
      }
    } else {
      patterns.push(arg);
    }
  }

  if (!targetType) {
    process.stderr.write('Must specify --prod or --dev\n');
    return 1;
  }

  if (patterns.length === 0) {
    process.stderr.write('Must specify at least one pattern\n');
    return 1;
  }

  const regexList: MMRegExp[] = [];
  for (const pattern of patterns) {
    const regex = minimatch.makeRe(pattern);
    if (regex === false) {
      process.stderr.write(`Invalid pattern: "${pattern}"\n`);
      return 1;
    }
    regexList.push(regex);
  }

  function isMatch(dependencyName: string): boolean {
    for (const regex of regexList) {
      if (regex.test(dependencyName)) return true;
    }
    return false;
  }

  let didAnythingMove = false;
  for (const pkg of workspacePackageInfo.values()) {
    const { packageJson, packageJsonPath } = pkg;
    if (!packageJson || !packageJsonPath) continue;

    const { dependencies, devDependencies } = packageJson;

    const newDevDependencies: { [name: string]: string } = {};
    const newDependencies: { [name: string]: string } = {};

    if (devDependencies) {
      for (const [name, version] of Object.entries(devDependencies)) {
        if (targetType === 'prod' && isMatch(name)) {
          process.stdout.write(
            `${pkg.name}: ${
              dryRun ? 'would move' : 'moving'
            } dependency "${name}" from devDependencies to dependencies\n`
          );
          newDependencies[name] = version;
          didAnythingMove = true;
        } else {
          newDevDependencies[name] = version;
        }
      }
    }

    if (dependencies) {
      for (const [name, version] of Object.entries(dependencies)) {
        if (targetType === 'dev' && isMatch(name)) {
          process.stdout.write(
            `${pkg.name}: ${
              dryRun ? 'would move' : 'moving'
            } dependency "${name}" from dependencies to devDependencies\n`
          );
          newDevDependencies[name] = version;
          didAnythingMove = true;
        } else {
          newDependencies[name] = version;
        }
      }
    }

    if (dryRun) continue;

    const numDependencies = Object.keys(dependencies || {}).length;
    const numDevDependencies = Object.keys(devDependencies || {}).length;

    const newNumDependencies = Object.keys(newDependencies).length;
    const newNumDevDependencies = Object.keys(newDevDependencies).length;

    if (
      numDependencies === newNumDependencies &&
      numDevDependencies === newNumDevDependencies
    ) {
      continue;
    }

    const newPackageJson: PackageJson = {
      ...packageJson,
      dependencies: newNumDependencies > 0 ? newDependencies : undefined,
      devDependencies:
        newNumDevDependencies > 0 ? newDevDependencies : undefined,
    };

    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(newPackageJson, null, 2)
    );
  }

  if (!didAnythingMove) {
    process.stdout.write(
      `no dependencies ${dryRun ? 'would move' : 'moved'}\n`
    );
  }

  return 0;
}
