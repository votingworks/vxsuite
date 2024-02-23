import { promisify } from 'node:util';
import { execFile } from 'child_process';
import { getAbsoluteRootPath } from './dependencies';

const exec = promisify(execFile);

// Ballot interpreter tests are already run by the pnpm package test job
// patinputd has no tests currently
const EXCLUDED_PACKAGE_IDS = ['ballot-interpreter', 'patinputd'];

/**
 * Get all Rust crate paths.
 */
export async function getRustPackageIds(root: string): Promise<string[]> {
  const absoluteRootPath = getAbsoluteRootPath(root);
  // Output is formatted like
  // "package-id v0.1.2 (/path/to/package)"
  // <newline>
  // "another-package-id v3.4.5 (/path/to/other-package)"
  const { stdout } = await exec(
    'cargo',
    ['tree', '-e', 'no-normal', '-e', 'no-dev', '-e', 'no-build'],
    { cwd: absoluteRootPath, encoding: 'utf-8' }
  );

  return stdout
    .split('\n')
    .filter((str) => !!str)
    .map((pkg) => pkg.split(' ')[0])
    .filter(
      (packageId): packageId is string =>
        packageId !== undefined && !EXCLUDED_PACKAGE_IDS.includes(packageId)
    );
}
