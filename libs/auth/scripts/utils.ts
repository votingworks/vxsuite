import { Buffer } from 'buffer';
import { sleep } from '@votingworks/basics';
import { generatePin, hyphenatePin } from '@votingworks/utils';

import { ResponseApduError } from '../src/apdu';
import { CardStatusReady, StatefulCard } from '../src/card';
import { openssl } from '../src/cryptography';
import { JavaCard } from '../src/java_card';

/**
 * Generates an ECC private key and returns the private key contents in a buffer. The key is not
 * stored in a TPM.
 */
export async function generatePrivateKey(): Promise<Buffer> {
  return await openssl(['ecparam', '-genkey', '-name', 'prime256v1', '-noout']);
}

/**
 * Waits for a card to have a ready status
 */
export async function waitForReadyCardStatus<T>(
  card: StatefulCard<T>,
  waitTimeSeconds = 3
): Promise<CardStatusReady<T>> {
  let cardStatus = await card.getCardStatus();
  let remainingWaitTimeSeconds = waitTimeSeconds;
  while (cardStatus.status !== 'ready' && remainingWaitTimeSeconds > 0) {
    await sleep(1000);
    cardStatus = await card.getCardStatus();
    remainingWaitTimeSeconds -= 1;
  }
  if (cardStatus.status !== 'ready') {
    throw new Error(`Card status not "ready" after ${waitTimeSeconds} seconds`);
  }
  return cardStatus;
}

/**
 * Programs a system administrator Java Card
 */
export async function programSystemAdministratorJavaCard({
  card,
  isProduction,
  jurisdiction,
}: {
  card: JavaCard;
  isProduction: boolean;
  jurisdiction: string;
}): Promise<void> {
  const initialJavaCardConfigurationScriptReminder = `
${
  isProduction
    ? 'Have you run this card through the configure-java-card script yet?'
    : 'Have you run this card through the configure-dev-java-card script yet?'
}
If not, that's likely the cause of this error.
Run that and then retry.
`;

  await waitForReadyCardStatus(card);

  const pin = isProduction ? generatePin() : '000000';
  try {
    await card.program({
      user: { role: 'system_administrator', jurisdiction },
      pin,
    });
  } catch (error) {
    if (error instanceof ResponseApduError) {
      throw new Error(
        `${error.message}\n${initialJavaCardConfigurationScriptReminder}`
      );
    }
    throw error;
  }
  console.log(`✅ Done! Card PIN is ${hyphenatePin(pin)}.`);
}
