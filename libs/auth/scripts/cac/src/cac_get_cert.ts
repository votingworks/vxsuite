import { createWriteStream } from 'node:fs';
import { throwIllegalValue } from '@votingworks/basics';
import {
  CARD_DOD_CERT,
  CommonAccessCard,
  CommonAccessCardCompatibleCard,
} from '../../../src/cac';
import { waitForReadyCardStatus } from '../../src/utils';

/**
 * Gets the certificate from a Common Access Card.
 */
export async function main(args: readonly string[]): Promise<void> {
  let out: NodeJS.WritableStream = process.stdout;
  let format: 'pem' | 'json' = 'pem';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-o':
      case '--output': {
        i += 1;
        const outputFilePath = args[i];
        if (!outputFilePath) {
          process.stderr.write(
            `error: cac-get-cert: missing argument for ${arg}\n`
          );
          process.exit(1);
        }
        out = createWriteStream(outputFilePath);
        break;
      }

      case '--json': {
        format = 'json';
        break;
      }

      case '--pem': {
        format = 'pem';
        break;
      }

      case '-h':
      case '--help': {
        process.stdout.write(
          `Usage: ${process.argv[1]} [-o OUTPUT_FILE] [--pem (default)|--json]\n`
        );
        process.exit(0);
        break;
      }

      default: {
        process.stderr.write(`error: cac-get-cert: unknown argument: ${arg}\n`);
        process.exit(1);
      }
    }
  }

  const card: CommonAccessCardCompatibleCard = new CommonAccessCard();
  await waitForReadyCardStatus(card);

  switch (format) {
    case 'pem': {
      const pem = await card.getCertificate({
        objectId: CARD_DOD_CERT.OBJECT_ID,
      });
      out.write(pem.toString('utf-8'), () => {
        process.exit(0);
      });
      break;
    }

    case 'json': {
      const cardStatus = await card.getCardStatus();

      if (cardStatus.status !== 'ready') {
        process.stderr.write('error: card not ready\n');
        process.exit(1);
      }

      out.end(JSON.stringify(cardStatus.cardDetails, undefined, 2), () => {
        process.exit(0);
      });
      break;
    }

    default: {
      throwIllegalValue(format);
    }
  }
}
