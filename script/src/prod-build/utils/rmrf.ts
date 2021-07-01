import { execSync } from './execSync'

export function rmrf(path: string): void {
  execSync('rm', ['-rf', path])
}
