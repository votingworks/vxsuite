import { createInterface } from 'readline';
import { CommonAccessCard } from '../src/common_access_card';
import {
  CardDetails,
  CommonAccessCardDetails,
  PinProtectedCard,
  StatefulCard,
} from '../src/card';
import { VxSuiteJavaCard } from '../src';
import { waitForReadyCardStatus } from './utils';

/**
 * Checks whether a PIN is correct.
 */
export async function main(args: readonly string[]): Promise<void> {
  let card: PinProtectedCard &
    StatefulCard<CardDetails | CommonAccessCardDetails>;

  for (const arg of args) {
    switch (arg) {
      case '--vxsuite': {
        // default
        break;
      }

      case '--cac': {
        card = new CommonAccessCard();
        break;
      }

      case '--help':
      case '-h': {
        process.stdout.write(`Usage: check-pin [--vxsuite (default)|--cac]\n`);
        process.exit(0);
        break;
      }

      default: {
        process.stderr.write(`Unknown argument: ${arg}\n`);
        process.exit(1);
      }
    }
  }

  const pin = await new Promise<string>((resolve) => {
    createInterface(process.stdin, process.stdout).question(
      'Enter PIN: ',
      resolve
    );
  });

  card ??= new VxSuiteJavaCard();
  console.time('waitForReadyCardStatus');
  await waitForReadyCardStatus(card);
  console.timeEnd('waitForReadyCardStatus');

  console.time('checkPin');
  const result = await card.checkPin(pin);
  console.timeEnd('checkPin');

  console.log(result);
  process.exit(result.response === 'correct' ? 0 : 1);
}
