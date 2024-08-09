import fs from 'fs/promises';
import { Readable } from 'stream';
import { assert } from '@votingworks/basics';

import {
  constructSignedHashValidationConfig,
  SignedHashValidationConfig,
} from './config';
import { signMessage } from './cryptography';
import { FileKey, TpmKey } from './keys';
import { constructPrefixedMessage } from './signatures';

const SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR = '/';
const SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR = ';';

interface SignedHashValidationMachineState {
  machineId: string;
  ballotHash?: string;
}

/**
 * Signed hash validation allows election officials to check that a VxSuite machine hasn't been
 * tampered with.
 */
export class SignedHashValidation {
  private readonly machineCertPath: string;
  private readonly machinePrivateKey: FileKey | TpmKey;

  constructor(
    // Support specifying a custom config for tests
    /* istanbul ignore next */
    input: SignedHashValidationConfig = constructSignedHashValidationConfig()
  ) {
    this.machineCertPath = input.machineCertPath;
    this.machinePrivateKey = input.machinePrivateKey;
  }

  async generateQrCodeValue({
    machineId,
    ballotHash,
  }: SignedHashValidationMachineState): Promise<{
    qrCodeValue: string;
    signatureInputs: {
      machineId: string;
      date: Date;
      ballotHashPrefix?: string;
    };
  }> {
    const date = new Date();
    const ballotHashPrefix = ballotHash?.slice(0, 10) ?? '';
    const messagePayload = [
      machineId,
      date.toISOString(),
      ballotHashPrefix,
    ].join(SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR);
    const message = constructPrefixedMessage(
      'lc', // Live Check (legacy feature name)
      messagePayload
    );

    const messageSignature = await signMessage({
      message: Readable.from(message),
      signingPrivateKey: this.machinePrivateKey,
    });

    const machineCert = await fs.readFile(this.machineCertPath, 'utf-8');

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
        machineId,
        date,
        ballotHashPrefix,
      },
    };
  }
}
