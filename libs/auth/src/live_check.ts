import fs from 'fs/promises';
import { Readable } from 'stream';
import { assert } from '@votingworks/basics';

import { constructLiveCheckConfig, LiveCheckConfig } from './config';
import { signMessage } from './cryptography';
import { FileKey, TpmKey } from './keys';
import { constructPrefixedMessage } from './signatures';

const LIVE_CHECK_MESSAGE_PAYLOAD_SEPARATOR = '/';
const LIVE_CHECK_QR_CODE_VALUE_SEPARATOR = ';';

interface LiveCheckMachineState {
  machineId: string;
  ballotHash?: string;
}

/**
 * Live Check allows election officials to check that a VxSuite machine hasn't been tampered with.
 */
export class LiveCheck {
  private readonly machineCertPath: string;
  private readonly machinePrivateKey: FileKey | TpmKey;

  constructor(
    // Support specifying a custom config for tests
    /* istanbul ignore next */
    input: LiveCheckConfig = constructLiveCheckConfig()
  ) {
    this.machineCertPath = input.machineCertPath;
    this.machinePrivateKey = input.machinePrivateKey;
  }

  async generateQrCodeValue({
    machineId,
    ballotHash,
  }: LiveCheckMachineState): Promise<{
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
    ].join(LIVE_CHECK_MESSAGE_PAYLOAD_SEPARATOR);
    const message = constructPrefixedMessage(
      'lc', // Live Check
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
        (part) => !part.includes(LIVE_CHECK_QR_CODE_VALUE_SEPARATOR)
      ),
      `Found ${LIVE_CHECK_QR_CODE_VALUE_SEPARATOR} separator within part of QR code value`
    );
    const qrCodeValue = qrCodeValueParts.join(
      LIVE_CHECK_QR_CODE_VALUE_SEPARATOR
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
