import { findAllMonorepoDependencies } from './dependencies';
import { PackageInfo } from './pnpm';

/**
 * Finds unused packages in the monorepo.
 */
export function findUnusedPackages(
  pkgs: Map<string, PackageInfo>
): Set<PackageInfo> {
  const usedPackages = new Set<PackageInfo>();

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
