import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { assert } from '@votingworks/basics';
import {
  formatElectionHashes,
  SignedHashValidationQrCodeValue,
} from '@votingworks/types';

import { parseMachineDetailsFromCert } from './certs';
import {
  constructSignedHashValidationConfig,
  SignedHashValidationConfig,
} from './config';
import { signMessage } from './cryptography';
import { runCommand } from './shell';
import { constructPrefixedMessage } from './signatures';

/**
 * The separator between parts of the signed hash validation QR code value
 */
export const SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR = ';';

/**
 * The separator between parts of the signed hash validation message payload
 */
export const SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR = '#';

async function computeSystemHash(): Promise<string> {
  const scriptPath = path.join(
    __dirname,
    '../src/intermediate-scripts/compute-system-hash'
  );
  const stdout = await runCommand(['sudo', scriptPath]);
  // Returns UNVERIFIED on non-locked-down machines and a SHA256 hash on locked-down machines
  const systemHash = stdout.toString('utf-8').trim();

  let systemHashBase64: string;
  /* istanbul ignore else */
  if (systemHash === 'UNVERIFIED') {
    systemHashBase64 = systemHash.padEnd(44, '=');
  } else {
    systemHashBase64 = Buffer.from(systemHash, 'hex').toString('base64');
    assert(
      systemHashBase64.length === 44,
      `Expected base64 system hash to be 44 characters but got ${systemHashBase64}`
    );
  }
  return systemHashBase64;
}

interface ElectionRecord {
  electionDefinition: { ballotHash: string };
  electionPackageHash: string;
}

interface SignedHashValidationMachineState {
  electionRecord?: ElectionRecord;
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
  const { electionRecord, softwareVersion } = machineState;
  const systemHash = await computeSystemHash();
  const combinedElectionHash = electionRecord
    ? formatElectionHashes(
        electionRecord.electionDefinition.ballotHash,
        electionRecord.electionPackageHash
      )
    : '';
  const date = new Date();

  const messagePayloadParts: string[] = [
    systemHash,
    softwareVersion,
    combinedElectionHash,
    date.toISOString(),
  ];
  assert(
    messagePayloadParts.every(
      (part) => !part.includes(SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR)
    ),
    `Found ${SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR} separator within part of message payload`
  );
  const messagePayload = messagePayloadParts.join(
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

  const machineCert = await fs.readFile(config.machineCertPath);
  const { machineId } = await parseMachineDetailsFromCert(machineCert);

  const qrCodeValueParts: string[] = [
    message,
    messageSignature.toString('base64'),
    machineCert
      .toString('utf-8')
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
    qrCodeInputs: {
      combinedElectionHash,
      date,
      machineId,
      softwareVersion,
      systemHash,
    },
  };
}
