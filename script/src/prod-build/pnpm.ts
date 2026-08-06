import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNPM_LOGLEVEL, WORKSPACE_ROOT } from './globals';
import { execSync } from './utils/exec_sync';

/**
 * Check that `pnpm` on PATH is the version the lockfile was written with.
 *
 * The assembled workspace is installed with `pnpm install --frozen-lockfile`,
 * which a different pnpm major rejects with an opaque
 * ERR_PNPM_LOCKFILE_CONFIG_MISMATCH — and only after everything has already
 * been built and packed. Failing up front says what is actually wrong.
 */
export function assertExpectedPnpmVersion(): void {
  const { packageManager } = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, 'package.json'), 'utf8')
  ) as { packageManager?: string };
  const expected = packageManager?.replace(/^pnpm@/, '');

  if (!expected) {
    return;
  }

  let actual: string | undefined;
  try {
    actual = execFileSync('pnpm', ['--version'], { encoding: 'utf-8' }).trim();
  } catch {
    actual = undefined;
  }

  if (actual !== expected) {
    throw new Error(
      `prod-build needs pnpm ${expected}, as pinned by "packageManager" in the root package.json, but \`pnpm\` on PATH is ${
        actual ?? 'not runnable'
      }. Check that the right pnpm comes first on PATH.`
    );
  }
}

export function removeDependencies(
  pkgRoot: string,
  { dev }: { dev: boolean }
): void {
  const pkg = require(`${pkgRoot}/package`);
  const deps = Object.keys(
    (dev ? pkg.devDependencies : pkg.dependencies) || {}
  );

  if (deps.length === 0) {
    return;
  }

  execSync('pnpm', ['remove', ...deps, '--loglevel', PNPM_LOGLEVEL], {
    cwd: pkgRoot,
  });
  execSync('pnpm', ['install', '--offline', '--loglevel', PNPM_LOGLEVEL], {
    cwd: pkgRoot,
  });
}

export function deleteScript(pkgRoot: string, script: string): void {
  const pkgPath = require.resolve(`${pkgRoot}/package`);
  const pkg = require(pkgPath);
  delete pkg.scripts[script];
  writeFileSync(pkgPath, JSON.stringify(pkg));
}
