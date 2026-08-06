import * as fs from 'node:fs';
import { basename, join } from 'node:path';
import { doBuild, doCopy, inBuildDir } from './build';
import {
  getDependencyGraph,
  getPackages,
  getProductionPackages,
  PackageType,
} from './deps';
import { BUILD_ROOT, WORKSPACE_ROOT } from './globals';
import { assertExpectedPnpmVersion, deleteScript } from './pnpm';
import { IO } from '../types';
import { execSync } from './utils/exec_sync';
import { existsSync } from './utils/exists_sync';
import { mkdirp } from './utils/mkdirp';
import { rmrf } from './utils/rmrf';

export function main({ stdout }: IO): void {
  assertExpectedPnpmVersion();

  // Ensure pipenv places the virtualenv in the project.
  process.env.PIPENV_VENV_IN_PROJECT = '0';

  const root = getDependencyGraph(process.cwd(), PackageType.Frontend);
  stdout.write(`ℹ️ Building ${root.path} for production\n`);
  stdout.write(`ℹ️ Output: ${BUILD_ROOT}\n`);
  stdout.write(`\n`);

  const allPackages = getPackages(root);
  const appPackages = [...allPackages].filter(
    ({ type }) => type !== PackageType.Library
  );
  const prodPackages = getProductionPackages(root);

  for (const { path } of appPackages) {
    stdout.write(`🔨 ${path}\n`);
    doBuild(path);
  }

  const outRoot = BUILD_ROOT;
  stdout.write(`📦 Creating ${outRoot} workspace…\n`);
  rmrf(outRoot);
  mkdirp(outRoot);
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.pnpmfile.cjs',
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
  // removeDependencies(outRoot, { dev: false });
  // removeDependencies(outRoot, { dev: true });

  for (const { path, isBundled } of allPackages) {
    stdout.write(`🪚 prune ${path}\n`);
    const depBuildRoot = inBuildDir(path, outRoot);
    if (existsSync(join(depBuildRoot, 'package.json'))) {
      stdout.write(`→ removing devDependencies\n`);
      // removeDependencies(depBuildRoot, { dev: true });

      if (isBundled) {
        stdout.write(`→ removing dependencies\n`);
        // removeDependencies(depBuildRoot, { dev: false });
      }
    }
  }

  for (const pkg of allPackages) {
    if (!prodPackages.has(pkg)) {
      stdout.write(`🪚 prune dev ${pkg.path}\n`);
      const depBuildRoot = inBuildDir(pkg.path, outRoot);
      // rmrf(depBuildRoot);
    }
  }

  stdout.write(`🪚 prune dev package dependencies\n`);
  // execSync('pnpm', ['install', '--offline'], { cwd: outRoot });
}
