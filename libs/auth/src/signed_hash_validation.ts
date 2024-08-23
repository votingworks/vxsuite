import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { assert, sleep } from '@votingworks/basics';
import {
  formatElectionHashes,
  SignedHashValidationQrCodeValue,
} from '@votingworks/types';

import {
  constructSignedHashValidationConfig,
  SignedHashValidationConfig,
} from './config';
import { signMessage } from './cryptography';
import { runCommand } from './shell';
import { constructPrefixedMessage } from './signatures';

const SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR = ';';
const SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR = '/';
const SYSTEM_HASH_DISPLAY_LENGTH = 10;

const HASHING_SCRIPT_PATH = '/vx/admin/admin-functions/hash-signature.sh';

async function computeSystemHash(): Promise<string> {
  /* istanbul ignore next */
  if (existsSync(HASHING_SCRIPT_PATH)) {
    const stdout = await runCommand([
      'sudo',
      HASHING_SCRIPT_PATH,
      'noninteractive',
    ]);
    return stdout.toString('utf-8');
  }

  // Mock system hash computation in dev
  await sleep(2000);
  return 'UNVERIFIED';
}

interface ElectionRecord {
  electionDefinition: { ballotHash: string };
  electionPackageHash: string;
}

interface SignedHashValidationMachineState {
  electionRecord?: ElectionRecord;
  machineId: string;
  softwareVersion: string;
}

/**
 * Signed hash validation allows election officials to check that a VxSuite machine hasn't been
 * tampered with.
 */
export async function generateSignedHashValidationQrCodeValue(
  machineState: SignedHashValidationMachineState,
  /* istanbul ignore next */
  config: SignedHashValidationConfig = constructSignedHashValidationConfig()
): Promise<SignedHashValidationQrCodeValue> {
  const { electionRecord, machineId, softwareVersion } = machineState;
  const systemHash = (await computeSystemHash()).slice(
    0,
    SYSTEM_HASH_DISPLAY_LENGTH
  );
  const combinedElectionHash = electionRecord
    ? formatElectionHashes(
        electionRecord.electionDefinition.ballotHash,
        electionRecord.electionPackageHash
      )
    : '';
  const date = new Date();

  const messagePayloadComponents: string[] = [
    systemHash,
    softwareVersion,
    machineId,
    combinedElectionHash,
    date.toISOString(),
  ];
  const messagePayload = messagePayloadComponents.join(
    SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR
  );
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
      combinedElectionHash,
      date,
      machineId,
      softwareVersion,
      systemHash,
    },
  };
}
