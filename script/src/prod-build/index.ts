import * as fs from 'node:fs';
import { basename, join } from 'node:path';
import { doCopy } from './build.ts';
import { getDependencyGraph, getPackages } from './deps.ts';
import { BUILD_ROOT, WORKSPACE_ROOT } from './globals.ts';
import { assertExpectedPnpmVersion, deleteScript } from './pnpm.ts';
import type { IO } from '../types.ts';
import { execSync } from './utils/exec_sync.ts';
import { existsSync } from './utils/exists_sync.ts';
import { mkdirp } from './utils/mkdirp.ts';
import { rmrf } from './utils/rmrf.ts';

export function main({ stdout }: IO): void {
  assertExpectedPnpmVersion();

  // Ensure pipenv places the virtualenv in the project.
  process.env.PIPENV_VENV_IN_PROJECT = '0';

  const root = getDependencyGraph(process.cwd(), 'frontend');
  stdout.write(`ℹ️ Building ${root.path} for production\n`);
  stdout.write(`ℹ️ Output: ${BUILD_ROOT}\n`);
  stdout.write(`\n`);

  const allPackages = getPackages(root);
  const appPackages = [...allPackages].filter(({ type }) => type !== 'lib');

  // Build the app packages via turbo, which orders and caches the whole
  // dependency graph. `pnpm exec` resolves turbo from the workspace without
  // relying on it being on PATH.
  const buildFilters = appPackages.map((pkg) => `--filter=${pkg.name}`);
  stdout.write(
    `🔨 Building ${appPackages.map((pkg) => pkg.name).join(', ')}\n`
  );
  execSync('pnpm', ['exec', 'turbo', 'run', 'build:self', ...buildFilters], {
    cwd: WORKSPACE_ROOT,
  });

  const outRoot = BUILD_ROOT;
  stdout.write(`📦 Creating ${outRoot} workspace…\n`);
  rmrf(outRoot);
  mkdirp(outRoot);
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'Cargo.toml',
    'Cargo.lock',
  ]) {
    fs.copyFileSync(join(WORKSPACE_ROOT, file), join(outRoot, basename(file)));
  }

  // `pnpm.patchedDependencies` in the root package.json points at patch files by
  // path, so `pnpm install` in the copied workspace needs them alongside it.
  const patchesDir = join(WORKSPACE_ROOT, 'patches');
  if (existsSync(patchesDir)) {
    fs.cpSync(patchesDir, join(outRoot, 'patches'), { recursive: true });
  }

  for (const { path } of allPackages) {
    stdout.write(`📦 packing ${path}\n`);
    doCopy(path, outRoot);
  }

  stdout.write(`🗑 Removing 'prepare' script because husky is not needed\n`);
  deleteScript(outRoot, 'prepare');
  stdout.write(`📦 Installing dependencies in workspace\n`);
  execSync('pnpm', ['install', '--frozen-lockfile'], { cwd: outRoot });
}
