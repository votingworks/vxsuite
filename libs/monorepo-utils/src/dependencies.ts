import { PackageInfo } from './pnpm';

/**
 * Gets all dependencies from a package.json file.
 */
export function getAllDependencies(pkg: PackageInfo): Record<string, string> {
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
  pkgs: Map<string, PackageInfo>,
  pkg: PackageInfo
): Generator<PackageInfo> {
  const yielded = new Set<PackageInfo>([pkg]);
  const queue = [pkg];

  while (queue.length > 0) {
    const parent = queue.shift() as PackageInfo;
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
