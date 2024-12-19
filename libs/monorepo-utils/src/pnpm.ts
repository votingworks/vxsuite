import { assert, lines } from '@votingworks/basics';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getAbsoluteRootPath } from './dependencies';
import { PnpmPackageInfo, PackageJson } from './types';

/**
 * Read a JSON file, returning `undefined` if the file does not exist.
 */
function maybeReadJson(filepath: string): unknown {
  try {
    return JSON.parse(readFileSync(filepath, { encoding: 'utf-8' }));
  } catch {
    /* istanbul ignore next - @preserve */
    return undefined;
  }
}

/**
 * Read a `package.json` file, returning `undefined` if the file does not exist.
 */
function maybeReadPackageJson(filepath: string): PackageJson | undefined {
  return maybeReadJson(filepath) as PackageJson | undefined;
}

/**
 * Get all pnpm workspace package paths.
 */
export function getWorkspacePackagePaths(root: string): string[] {
  const absoluteRootPath = getAbsoluteRootPath(root);
  const stdout = execFileSync(
    'pnpm',
    ['recursive', 'list', '--depth=-1', '--porcelain'],
    { cwd: absoluteRootPath, encoding: 'utf-8' }
  );
  return lines(stdout)
    .map((line) => relative(absoluteRootPath, line))
    .filter((line) => line.length > 0)
    .toArray();
}

/**
 * Get all pnpm workspace package info by package name.
 */
export function getWorkspacePackageInfo(
  root: string
): Map<string, PnpmPackageInfo> {
  const result = new Map<string, PnpmPackageInfo>();

  for (const path of getWorkspacePackagePaths(root)) {
    const packageJsonPath = join(root, path, 'package.json');
    const packageJson = maybeReadPackageJson(packageJsonPath);
    assert(packageJson);

    result.set(packageJson.name, {
      path: join(root, path),
      relativePath: path,
      name: packageJson.name,
      version: packageJson.version,
      main: packageJson.main,
      module: packageJson.module,
      source: (packageJson.main || packageJson.module) && 'src/index.ts',
      packageJson,
      packageJsonPath,
    });
  }

  return result;
}
