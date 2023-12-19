import { assert, lines } from '@votingworks/basics';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { isAbsolute, join, relative } from 'path';

/**
 * Package info from `package.json`.
 */
export interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly main?: string;
  readonly module?: string;
  readonly scripts?: { [name: string]: string };
  readonly dependencies?: { [name: string]: string };
  readonly devDependencies?: { [name: string]: string };
  readonly peerDependencies?: { [name: string]: string };
  readonly packageManager?: string;

  /**
   * Binaries of the package, i.e. `bin` from `package.json`.
   */
  readonly bin?: string | { [name: string]: string };
}

/**
 * Workspace package info.
 */
export interface PackageInfo {
  /**
   * Absolute path to the package root.
   */
  readonly path: string;

  /**
   * Path to the package root relative to the workspace root.
   */
  readonly relativePath: string;

  /**
   * Name of the package, i.e. `name` from `package.json`.
   */
  readonly name: string;

  /**
   * Version of the package, i.e. `version` from `package.json`.
   */
  readonly version: string;

  /**
   * Main CJS entry point of the package, i.e. `main` from `package.json`.
   * Missing if the package is not a library.
   */
  readonly main?: string;

  /**
   * Main ESM entry point of the package, i.e. `module` from `package.json`.
   * Missing if the package is not a library.
   */
  readonly module?: string;

  /**
   * Original source code entry point of the package, i.e. `src/index.ts`.
   * Missing if the package is not a library.
   */
  readonly source?: string;

  /**
   * The full `package.json` contents.
   */
  readonly packageJson?: PackageJson;

  /**
   * The full `package.json` path.
   */
  readonly packageJsonPath?: string;
}

/**
 * Read a JSON file, returning `undefined` if the file does not exist.
 */
function maybeReadJson(filepath: string): unknown {
  try {
    return JSON.parse(readFileSync(filepath, { encoding: 'utf-8' }));
  } catch {
    // istanbul ignore next
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
  const absoluteRootPath = isAbsolute(root) ? root : join(process.cwd(), root);
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
): Map<string, PackageInfo> {
  const result = new Map<string, PackageInfo>();

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
