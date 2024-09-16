import { spawnSync } from 'node:child_process';

export function execSync(
  command: string,
  args: readonly string[],
  { cwd }: { cwd?: string } = {}
) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw (
      result.error ||
      result.stderr ||
      new Error(
        `${command} ${args.join(' ')} failed with exit code ${result.status}`
      )
    );
  }
}
