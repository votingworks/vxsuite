import { Buffer } from 'node:buffer';
import { assert, sleep, throwIllegalValue } from '@votingworks/basics';
import { SystemAdministratorUser, VendorUser } from '@votingworks/types';
import { generatePin, hyphenatePin } from '@votingworks/utils';

import { ResponseApduError } from '../../src/apdu';
import { CardStatusReady, StatefulCard } from '../../src/card';
import { STANDARD_CERT_FIELDS } from '../../src/certs';
import { openssl } from '../../src/cryptography';
import { JavaCard } from '../../src/java_card';

/**
 * Generates an ECC private key and returns the private key contents in a buffer. The key is not
 * stored in an HSM.
 */
export async function generatePrivateKey(
  options: { encrypted?: boolean } = {}
): Promise<Buffer> {
  return await openssl([
    'genpkey',
    '-algorithm',
    'EC',
    '-pkeyopt',
    'ec_paramgen_curve:prime256v1',
    ...(options.encrypted ? ['-aes-256-cbc'] : []),
  ]);
}

/**
 * Generates a self-signed cert to be used as the root in a cert chain
 */
export async function generateSelfSignedCert({
  privateKeyPath,
  commonName,
  expiryDays,
}: {
  privateKeyPath: string;
  commonName: string;
  expiryDays: number;
}): Promise<Buffer> {
  const certFields = [...STANDARD_CERT_FIELDS, `CN=${commonName}`];
  assert(
    certFields.every((certField) => !certField.includes('/')),
    `Cert fields cannot contain a slash: ${certFields}`
  );
  return openssl([
    'req',
    '-new',
    '-x509',
    '-key',
    privateKeyPath,
    '-subj',
    `/${certFields.join('/')}`,
    '-days',
    `${expiryDays}`,
  ]);
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
 * Programs a vendor or system administrator Java Card
 */
export async function programJavaCard({
  card,
  isProduction,
  user,
}: {
  card: JavaCard;
  isProduction: boolean;
  user: VendorUser | SystemAdministratorUser;
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
    switch (user.role) {
      case 'vendor': {
        await card.program({ user, pin });
        break;
      }
      case 'system_administrator': {
        await card.program({ user, pin });
        break;
      }
      default: {
        throwIllegalValue(user, 'role');
      }
    }
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
