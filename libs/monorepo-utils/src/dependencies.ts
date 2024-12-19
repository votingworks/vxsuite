import { isAbsolute, join } from 'node:path';
import { PnpmPackageInfo } from './types';

/**
 * Gets all dependencies from a package.json file.
 */
export function getAllDependencies(
  pkg: PnpmPackageInfo
): Record<string, string> {
  return {
    ...(pkg.packageJson?.dependencies ?? {}),
    ...(pkg.packageJson?.devDependencies ?? {}),
    ...(pkg.packageJson?.peerDependencies ?? {}),
  };
}

/**
 * Yields all monorepo dependencies for a package.
 */
export function* findAllMonorepoDependencies(
  pkgs: Map<string, PnpmPackageInfo>,
  pkg: PnpmPackageInfo
): Generator<PnpmPackageInfo> {
  const yielded = new Set<PnpmPackageInfo>([pkg]);
  const queue = [pkg];

  while (queue.length > 0) {
    const parent = queue.shift() as PnpmPackageInfo;
    for (const dep of Object.keys(getAllDependencies(parent))) {
      const depPkg = pkgs.get(dep);
      if (depPkg && !yielded.has(depPkg)) {
        yielded.add(depPkg);
        queue.push(depPkg);
        yield depPkg;
      }
    }
  }
}

/**
 * Returns the absolute filepath for the given filepath
 */
export function getAbsoluteRootPath(root: string): string {
  return isAbsolute(root) ? root : join(process.cwd(), root);
}
