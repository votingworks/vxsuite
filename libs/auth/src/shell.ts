import { Buffer } from 'buffer';
import { spawn } from 'child_process';
import { Stream } from 'stream';
import { assert } from '@votingworks/basics';

interface RunCommandOptions {
  /** A function to run on child process close, e.g. for cleanup */
  onClose?: () => Promise<void>;
  /** Data to pipe to the child process's standard input */
  stdin?: Stream;
}

/**
 * Runs a shell command asynchronously.
 *
 * The returned promise resolves if the shell command's exit status is 0 and rejects otherwise. The
 * promise also rejects if the onClose function, if provided, errs.
 */
export async function runCommand(
  command: string[],
  { onClose, stdin }: RunCommandOptions = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    assert(command[0] !== undefined);
    const childProcess = spawn(command[0], command.slice(1));

    let stdout: Buffer = Buffer.from([]);
    childProcess.stdout.on('data', (data) => {
      stdout = Buffer.concat([stdout, data]);
    });

    let stderr: Buffer = Buffer.from([]);
    childProcess.stderr.on('data', (data) => {
      stderr = Buffer.concat([stderr, data]);
    });

    if (stdin) {
      stdin.pipe(childProcess.stdin);
    }

    childProcess.on('close', async (code) => {
      if (onClose) {
        try {
          await onClose();
        } catch (error) {
          reject(error);
          return;
        }
      }
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
