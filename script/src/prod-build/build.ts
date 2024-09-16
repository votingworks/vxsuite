import { join } from 'node:path';
import { WORKSPACE_ROOT } from './globals';
import { execSync } from './utils/exec_sync';
import { existsSync } from './utils/exists_sync';
import { mkdirp } from './utils/mkdirp';
import { relativePath } from './utils/relative_path';

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

export function doBuild(pkgRoot: string) {
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
