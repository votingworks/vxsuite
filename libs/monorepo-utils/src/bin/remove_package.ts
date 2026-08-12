import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { getWorkspacePackageInfo } from '../pnpm';
import { findAllMonorepoDependencies } from '../dependencies';

// This file compiles to `build/bin/`, so the repo root is four levels up.
const workspaceRoot = join(__dirname, '..', '..', '..', '..');

function removePackages(names: readonly string[]): void {
  for (const name of names) {
    const pkgs = getWorkspacePackageInfo(workspaceRoot);
    const pkgToRemove = pkgs.get(name);

    if (!pkgToRemove) {
      process.stderr.write(`Package ${name} not found!\n`);
      process.exit(1);
    }

    for (const pkg of pkgs.values()) {
      if (pkg !== pkgToRemove) {
        for (const dep of findAllMonorepoDependencies(pkgs, pkg)) {
          if (dep === pkgToRemove) {
            process.stderr.write(
              `Package ${pkgToRemove.name} is depended on by ${pkg.name}!\n`
            );
            process.exit(1);
          }
        }
      }
    }

    process.stdout.write(`Removing ${pkgToRemove.name}…\n`);
    rmSync(pkgToRemove.path, { recursive: true, force: true });
  }
}

removePackages(process.argv.slice(2));
