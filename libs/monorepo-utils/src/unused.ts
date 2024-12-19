import { findAllMonorepoDependencies } from './dependencies';
import { PnpmPackageInfo } from './types';

/**
 * Finds unused packages in the monorepo.
 */
export function findUnusedPackages(
  pkgs: Map<string, PnpmPackageInfo>
): Set<PnpmPackageInfo> {
  const usedPackages = new Set<PnpmPackageInfo>();

  for (const pkg of pkgs.values()) {
    const isInherentlyUsed = Boolean(
      !pkg.relativePath.startsWith('libs/') ||
        !pkg.packageJson ||
        pkg.packageJson.bin
    );

    if (isInherentlyUsed) {
      usedPackages.add(pkg);
      for (const depPkg of findAllMonorepoDependencies(pkgs, pkg)) {
        usedPackages.add(depPkg);
      }
    }
  }

  return new Set([...pkgs.values()].filter((pkg) => !usedPackages.has(pkg)));
}
