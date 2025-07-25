import { Result, err, ok } from '@votingworks/basics';
import { spawn } from 'node:child_process';
import makeDebug from 'debug';
import { Readable } from 'node:stream';

const debug = makeDebug('kiosk-browser:exec');

export interface ExecError {
  code: number;
  signal: string | null;
  stdout: string;
  stderr: string;
  cmd: string;
}

export function makeExecError({
  code,
  signal,
  stdout,
  stderr,
  cmd,
}: ExecError): ExecError & Error {
  const error = new Error(
    `Error: Command failed: ${cmd} (stdout=${stdout} stderr=${stderr})`
  ) as unknown as ExecError & Error;
  Object.defineProperties(error, {
    code: {
      value: code,
    },

    signal: {
      value: signal,
    },

    cmd: {
      value: cmd,
    },

    stdout: {
      value: stdout,
    },

    stderr: {
      value: stderr,
    },
  });

  return error;
}

/**
 * The native `child_process.exec` does not sanitize input, so we have our own
 * custom `exec` function which does sanitize input by using
 * `child_process.spawn` under the hood. It also offers easier stdio than
 * `child_process.exec`.
 */
export async function exec(
  file: string,
  // eslint-disable-next-line default-param-last
  args: readonly string[] = [],
  stdin?:
    | string
    | Uint8Array
    | NodeJS.ReadableStream
    | Iterable<Uint8Array | string>
    | AsyncIterable<Uint8Array | string>
): Promise<Result<{ stdout: string; stderr: string }, ExecError>> {
  const child = spawn(file, args);
  let stdout = '';
  let stderr = '';

  debug(
    'running command=%s args=%o stdin=%s pid=%d',
    file,
    args,
    typeof stdin,
    child.pid
  );

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  if (stdin) {
    debug('stdin passed to exec, feeding it in now.');

    if (stdin instanceof Uint8Array) {
      // `Readable.from` will chunk each byte in a `Uint8Array` individually, so
      // a conversion to `Uint8Array[]` is necessary here. This mimics Node's
      // special handling for `Readable.from(Buffer)`.
      Readable.from([stdin]).pipe(child.stdin);
    } else {
      Readable.from(stdin).pipe(child.stdin);
    }
  }

  return new Promise((resolve) => {
    child.on('close', (code, signal) => {
      debug(
        'process %d exited with code=%d, signal=%s (command=%s args=%o)',
        child.pid,
        code,
        signal,
        file,
        args
      );

      resolve(
        code === 0
          ? ok({ stdout, stderr })
          : err(
              makeExecError({
                code: /* istanbul ignore next - @preserve */ code ?? 1,
                signal,
                stdout,
                stderr,
                cmd: `${file} ${args.join(' ')}`,
              })
            )
      );
    });
  });
}
