import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { findUnusedPackages } from '../unused';
import { getWorkspacePackageInfo } from '../pnpm';

// This file compiles to `build/bin/`, so the repo root is four levels up.
const MONOREPO_ROOT = join(__dirname, '..', '..', '..', '..');

function pruneUnusedPackages({
  dryRun = false,
}: { dryRun?: boolean } = {}): void {
  let count = 0;

  function doPrunePass(): void {
    const initialCount = count;
    const pkgs = getWorkspacePackageInfo(MONOREPO_ROOT);

    for (const pkg of findUnusedPackages(pkgs)) {
      process.stdout.write(`${dryRun ? '[skip] ' : ''}Removing ${pkg.name}…\n`);
      if (!dryRun) {
        rmSync(pkg.path, { recursive: true });
      }
      count += 1;
    }

    if (count > initialCount) {
      doPrunePass();
    }
  }

  doPrunePass();

  process.stdout.write(
    dryRun
      ? `Would remove ${count} packages.\n`
      : `Removed ${count} packages.\n`
  );
}

pruneUnusedPackages({ dryRun: process.argv.includes('--dry-run') });
