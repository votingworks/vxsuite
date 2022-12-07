import { detectQrCode } from '@votingworks/ballot-interpreter-vx';
import { loadImageData } from '@votingworks/image-utils';
import chalk from 'chalk';
import { basename } from 'path';

export interface IO {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

function usage(name: string, out: NodeJS.WritableStream): void {
  out.write(`${name} [IMAGE_PATH …]\n`);
}

/**
 * Entry point for `read-qrcode` command. Reads QR code from ballot images and
 * prints information about the QR code and its position.
 */
export async function main(argv: readonly string[], io: IO): Promise<number> {
  const name = basename(argv[1]);
  const imagePaths: string[] = [];

  for (const arg of argv.slice(2)) {
    switch (arg) {
      case '-h':
      case '--help': {
        usage(name, io.stdout);
        return 0;
      }

      default: {
        if (arg.startsWith('-')) {
          io.stderr.write(`error: unrecognized option: ${arg}\n`);
          usage(name, io.stderr);
          return 1;
        }

        imagePaths.push(arg);
      }
    }
  }

  for (const imagePath of imagePaths) {
    const imageData = await loadImageData(imagePath);
    const detectResult = await detectQrCode(imageData);

    if (!detectResult) {
      io.stdout.write(
        `${chalk.bold(imagePath)}: ${chalk.red('no QR code detected')}\n`
      );
      continue;
    }

    io.stdout.write(
      `${chalk.bold(imagePath)} ${chalk.cyan(
        `@${detectResult.position}`
      )} via ${chalk.yellow(detectResult.detector)}: ${chalk.italic(
        detectResult.data.toString('base64')
      )}\n`
    );
  }

  return await Promise.resolve(0);
}
