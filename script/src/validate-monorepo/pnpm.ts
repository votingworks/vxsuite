import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';

/**
 * Workspace package info.
 */
export interface PackageInfo {
  /**
   * Absolute path to the package root.
   */
  readonly path: string;

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
}

/**
 * Get all pnpm workspace package paths.
 */
export function getWorkspacePackagePaths(root: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'pnpm',
      ['recursive', 'list', '--depth=-1', '--porcelain'],
      { cwd: root },
      (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(
            stdout
              .split('\n')
              .map((line) => relative(root, line))
              .filter((line) => line.length > 0)
          );
        }
      }
    );
  });
}

/**
 * Get all pnpm workspace package info by package name.
 */
export async function getWorkspacePackageInfo(
  root: string
): Promise<Map<string, PackageInfo>> {
  const result = new Map<string, PackageInfo>();

  for (const path of await getWorkspacePackagePaths(root)) {
    const packageJsonPath = join(root, path, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    result.set(packageJson.name, {
      path: join(root, path),
      name: packageJson.name,
      version: packageJson.version,
      main: packageJson.main,
      module: packageJson.module,
      source: (packageJson.main || packageJson.module) && 'src/index.ts',
    });
  }

  return result;
}
