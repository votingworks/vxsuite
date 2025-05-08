import readline from 'node:readline';
import { extractErrorMessage } from '@votingworks/basics';

import { JavaCard } from '../../src/java_card';
import { waitForReadyCardStatus } from './utils';

async function checkPin(): Promise<void> {
  const rl = readline.createInterface(process.stdin, process.stdout);
  const pin = await new Promise<string>((resolve) => {
    rl.question('Enter PIN: ', resolve);
  });
  rl.close();

  (process.env.NODE_ENV as string) = 'development';
  (process.env.VX_MACHINE_TYPE as string) = 'admin';
  const card = new JavaCard();

  await waitForReadyCardStatus(card);
  const checkPinResponse = await card.checkPin(pin);
  console.log(checkPinResponse);
}

/**
 * A script for checking a Java Card PIN
 */
export async function main(): Promise<void> {
  try {
    await checkPin();
    process.exit(0); // Smart card scripts require an explicit exit or else they hang
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
