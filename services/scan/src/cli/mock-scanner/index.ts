import got, { Response } from 'got';
import { resolve } from 'path';
import { MOCK_SCANNER_PORT } from '../../globals';

type Command =
  | { type: 'help'; commandName?: Command['type'] }
  | { type: 'load'; files: readonly [string, string] }
  | { type: 'remove' };

const BASE_URL = `http://localhost:${MOCK_SCANNER_PORT}`;

function help(out: NodeJS.WritableStream): void {
  out.write('mock-scanner load FILE1 FILE2\n');
  out.write('mock-scanner remove\n');
}

function handleResponse(response: Response<string>): number {
  if (response.statusCode < 300) {
    return 0;
  }

  process.stderr.write(
    `error: ${response.statusCode} ${response.statusMessage}\n`
  );
  process.stderr.write(response.body);
  return -1;
}

export async function main(args: readonly string[]): Promise<number> {
  let command: Command | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === 'load') {
      if (args[i + 1] && args[i + 2]) {
        command = {
          type: 'load',
          files: [
            resolve(process.cwd(), args[i + 1]),
            resolve(process.cwd(), args[i + 2]),
          ],
        };
      }
    } else if (arg === 'remove') {
      command = {
        type: 'remove',
      };
    } else if (arg === 'help') {
      command = {
        type: 'help',
        commandName: args[i + 1] as Command['type'],
      };
    }
  }

  switch (command?.type) {
    case 'load':
      return handleResponse(
        await got.put(`${BASE_URL}/mock`, {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files: command.files }),
          throwHttpErrors: false,
        })
      );

    case 'remove':
      return handleResponse(
        await got.delete(`${BASE_URL}/mock`, { throwHttpErrors: false })
      );

    case 'help':
      help(process.stdout);
      break;

    default:
      help(process.stderr);
      return -1;
  }

  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2))
    .catch((error) => {
      process.stderr.write(`CRASH: ${error}\n`);
      return 1;
    })
    .then((code) => {
      process.exitCode = code;
    });
}
