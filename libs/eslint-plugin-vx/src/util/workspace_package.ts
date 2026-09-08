import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageJson {
  readonly type?: string;
  readonly exports?: unknown;
}

/** Resolved `package.json` path → its parsed contents, or `undefined`. */
const packageJsonByPath = new Map<string, PackageJson | undefined>();

/**
 * Locates a workspace package's `package.json` the way node would: by walking
 * up from `fromDir` looking for it under `node_modules`. pnpm links workspace
 * dependencies there, so this finds the real package for any importer that
 * declares the dependency.
 */
function findPackageJsonPath(
  fromDir: string,
  packageName: string
): string | undefined {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const packageJsonPath = path.join(
      dir,
      'node_modules',
      packageName,
      'package.json'
    );
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath;
    }
    if (dir === path.dirname(dir)) {
      return undefined;
    }
  }
}

/**
 * Reads a workspace package's `package.json`, or returns `undefined` when it
 * cannot be found or parsed. Results are cached per resolved path.
 */
export function readWorkspacePackageJson(
  fromDir: string,
  packageName: string
): PackageJson | undefined {
  const packageJsonPath = findPackageJsonPath(fromDir, packageName);
  if (!packageJsonPath) {
    return undefined;
  }

  if (packageJsonByPath.has(packageJsonPath)) {
    return packageJsonByPath.get(packageJsonPath);
  }

  let packageJson: PackageJson | undefined;
  try {
    packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8')
    ) as PackageJson;
  } catch {
    packageJson = undefined;
  }
  packageJsonByPath.set(packageJsonPath, packageJson);
  return packageJson;
}

/**
 * Whether the given workspace package is ESM, i.e. its `package.json` declares
 * `"type": "module"`. Returns `false` when the package cannot be found, so that
 * an unresolvable import is never reported.
 */
export function isEsmWorkspacePackage(
  fromDir: string,
  packageName: string
): boolean {
  return readWorkspacePackageJson(fromDir, packageName)?.type === 'module';
}

/**
 * Whether `subpath` (e.g. `./browser`) is declared in the given workspace
 * package's `exports` map. An undeclared subpath is package internals: node
 * refuses to resolve it, and importing it reaches past the package's public
 * surface.
 */
export function isExportedSubpath(
  fromDir: string,
  packageName: string,
  subpath: string
): boolean {
  const { exports } = readWorkspacePackageJson(fromDir, packageName) ?? {};
  if (typeof exports !== 'object' || exports === null) {
    return false;
  }
  return Object.hasOwn(exports, subpath);
}
