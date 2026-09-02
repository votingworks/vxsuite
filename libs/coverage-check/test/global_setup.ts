import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * vitest `globalSetup`: generates the fixtures' istanbul report before the
 * suite runs by executing `fixtures/fixture_tests.ts` under vitest's coverage
 * provider (the production pipeline, so the report has all the real remapping
 * quirks) into the gitignored `fixtures/coverage/coverage-final.json`.
 */
export function setup(): void {
  const packageDir = resolve(__dirname, '..');
  try {
    execFileSync(
      'pnpm',
      ['exec', 'vitest', 'run', '--root', 'fixtures', '--coverage'],
      { cwd: packageDir, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `generating the fixture coverage report failed:\n${stdout}\n${stderr}`
    );
  }
}
