import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { Stream } from 'node:stream';
import { assert } from '@votingworks/basics';

interface RunCommandOptions {
  /** Data to pipe to the child process's standard input */
  stdin?: Stream;
}

/**
 * Runs a shell command asynchronously.
 *
 * The returned promise resolves with the data written to the standard output if the shell
 * command's exit status is 0 and rejects with the data written to both the standard error and
 * standard output otherwise.
 */
export async function runCommand(
  command: string[],
  { stdin }: RunCommandOptions = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    assert(command[0] !== undefined);
    const childProcess = spawn(command[0], command.slice(1));

    let stdout: Buffer = Buffer.of();
    childProcess.stdout.on('data', (data) => {
      stdout = Buffer.concat([stdout, data]);
    });

    let stderr: Buffer = Buffer.of();
    childProcess.stderr.on('data', (data) => {
      stderr = Buffer.concat([stderr, data]);
    });

    if (stdin) {
      stdin.pipe(childProcess.stdin);
    }

    childProcess.on('close', (code) => {
      if (code !== 0) {
        const errorMessage = [stderr, stdout]
          .map((buffer) => buffer.toString('utf-8'))
          .filter(Boolean)
          .join('\n');
        reject(new Error(errorMessage));
      } else {
        resolve(stdout);
      }
    });
  });
}
