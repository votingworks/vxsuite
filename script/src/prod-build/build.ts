import { createRequire } from 'node:module';
import { join } from 'node:path';
import { WORKSPACE_ROOT } from './globals.ts';
import { execSync } from './utils/exec_sync.ts';
import { existsSync } from './utils/exists_sync.ts';
import { mkdirp } from './utils/mkdirp.ts';
import { relativePath } from './utils/relative_path.ts';

const require = createRequire(import.meta.url);

export function inBuildDir(path: string, buildRoot: string): string {
  return join(buildRoot, relativePath(path, { from: WORKSPACE_ROOT }));
}

function npmPackageArchiveFilename(pkgRoot: string): string {
  const pkg = require(join(pkgRoot, 'package'));

  return `${pkg.name
    .replace(/^@/, '')
    .replace(/[^a-z\d]+/g, '-')
    .replace(/-+/g, '-')}-${pkg.version}.tgz`;
}

export function doBuild(pkgRoot: string): void {
  execSync('make', ['build'], { cwd: pkgRoot });
}

export function doCopy(pkgRoot: string, outRoot: string): void {
  const pkgOut = inBuildDir(pkgRoot, outRoot);
  mkdirp(pkgOut);

  if (existsSync(join(pkgRoot, 'package.json'))) {
    execSync('npm', ['pack'], { cwd: pkgRoot });
    execSync(
      'tar',
      [
        'xzf',
        join(pkgRoot, npmPackageArchiveFilename(pkgRoot)),
        '--strip-components',
        '1',
      ],
      { cwd: pkgOut }
    );
  } else if (existsSync(join(pkgRoot, 'Pipfile'))) {
    execSync('rsync', ['--recursive', '--links', `${pkgRoot}/`, pkgOut]);
  } else {
    throw new Error(`unknown package language at ${pkgRoot}, expected nodejs`);
  }
}
