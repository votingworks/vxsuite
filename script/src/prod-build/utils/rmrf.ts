import { execSync } from './exec_sync';

export function rmrf(path: string): void {
  execSync('rm', ['-rf', path]);
}
