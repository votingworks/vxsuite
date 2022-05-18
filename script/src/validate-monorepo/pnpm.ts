import { execFile } from 'child_process';
import { relative } from 'path';

/**
 * Get all pnpm workspace package paths.
 */
export function getWorkspacePackagePaths(root: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'pnpm',
      ['recursive', 'list', '--depth=-1', '--porcelain'],
      { cwd: root },
      (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(
            stdout
              .split('\n')
              .map((line) => relative(root, line))
              .filter((line) => line.length > 0)
          );
        }
      }
    );
  });
}
