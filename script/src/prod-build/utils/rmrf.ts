import { execSync } from './exec_sync.js';

export function rmrf(path: string): void {
  execSync('rm', ['-rf', path]);
}
