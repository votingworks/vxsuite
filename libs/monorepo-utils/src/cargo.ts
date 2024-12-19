import { assertDefined, lines } from '@votingworks/basics';
import { spawn } from 'node:child_process';
import { getAbsoluteRootPath } from './dependencies';

/**
 * Get all Rust crate paths.
 */
export async function getRustPackageIds(root: string): Promise<string[]> {
  const absoluteRootPath = getAbsoluteRootPath(root);
  // Output is formatted like
  // "package-id v0.1.2 (/path/to/package)"
  // <newline>
  // "another-package-id v3.4.5 (/path/to/other-package)"
  const cargo = spawn(
    'cargo',
    ['tree', '-e', 'no-normal', '-e', 'no-dev', '-e', 'no-build'],
    { cwd: absoluteRootPath }
  );

  cargo.stdout.setEncoding('utf-8');

  return lines(cargo.stdout)
    .filterMap((line) => (line ? assertDefined(line.split(' ')[0]) : undefined))
    .toArray();
}
