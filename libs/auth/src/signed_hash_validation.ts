import fs from 'fs/promises';
import { sha256 } from 'js-sha256';
import { Readable } from 'stream';
import { assert, sleep } from '@votingworks/basics';
import {
  BALLOT_HASH_DISPLAY_LENGTH,
  formatBallotHash,
  SignedHashValidationQrCodeValue,
} from '@votingworks/types';
import { isVxDev } from '@votingworks/utils';

import {
  constructSignedHashValidationConfig,
  SignedHashValidationConfig,
} from './config';
import { signMessage } from './cryptography';
import { isNodeEnvProduction } from './env_vars';
import { runCommand } from './shell';
import { constructPrefixedMessage } from './signatures';

const SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR = ';';
const SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR = '/';
const SYSTEM_HASH_DISPLAY_LENGTH = BALLOT_HASH_DISPLAY_LENGTH;

async function computeSystemHash(): Promise<string> {
  if (isNodeEnvProduction() && !isVxDev()) {
    const stdout = await runCommand([
      'sudo',
      '/vx/admin/admin-functions/hash-signature.sh',
      'noninteractive',
    ]);
    return stdout.toString('utf-8');
  }

  // Mock system hash computation in dev
  await sleep(3000);
  return sha256('');
}

interface SignedHashValidationMachineState {
  ballotHash?: string;
  machineId: string;
  softwareVersion: string;
}

/**
 * Signed hash validation allows election officials to check that a VxSuite machine hasn't been
 * tampered with.
 */
export async function generateSignedHashValidationQrCodeValue(
  { ballotHash, machineId, softwareVersion }: SignedHashValidationMachineState,
  config: SignedHashValidationConfig = constructSignedHashValidationConfig()
): Promise<SignedHashValidationQrCodeValue> {
  const systemHashPrefix = (await computeSystemHash()).slice(
    0,
    SYSTEM_HASH_DISPLAY_LENGTH
  );
  const ballotHashPrefix = ballotHash ? formatBallotHash(ballotHash) : '';
  const date = new Date();

  const messagePayload = [
    softwareVersion,
    systemHashPrefix,
    machineId,
    ballotHashPrefix,
    date.toISOString(),
  ].join(SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR);
  const message = constructPrefixedMessage(
    'shv1', // Signed hash validation, version 1
    messagePayload
  );

  const messageSignature = await signMessage({
    message: Readable.from(message),
    signingPrivateKey: config.machinePrivateKey,
  });

  const machineCert = await fs.readFile(config.machineCertPath, 'utf-8');

  const qrCodeValueParts: string[] = [
    message,
    messageSignature.toString('base64'),
    machineCert
      // Remove the standard PEM header and footer to make the QR code as small as possible
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', ''),
  ];
  assert(
    qrCodeValueParts.every(
      (part) => !part.includes(SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR)
    ),
    `Found ${SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR} separator within part of QR code value`
  );
  const qrCodeValue = qrCodeValueParts.join(
    SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR
  );

  return {
    qrCodeValue,
    signatureInputs: {
      ballotHashPrefix,
      date,
      machineId,
      softwareVersion,
      systemHashPrefix,
    },
  };
}
