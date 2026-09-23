import { execSync } from './exec_sync.ts';

export function rmrf(path: string): void {
  execSync('rm', ['-rf', path]);
}
