import { writeFileSync } from 'node:fs';
import { PNPM_LOGLEVEL } from './globals';
import { execSync } from './utils/exec_sync';

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
