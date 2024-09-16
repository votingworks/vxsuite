import { Buffer } from 'node:buffer';
import { extractErrorMessage } from '@votingworks/basics';

import {
  parseSignMessageInputExcludingMessage,
  signMessageHelper,
} from '../cryptography';

/**
 * An intermediate component of signMessage in src/openssl.ts, needed for permissions purposes. See
 * signMessage for more context.
 */
export async function main(): Promise<void> {
  let messageSignature: Buffer;
  try {
    messageSignature = await signMessageHelper(
      parseSignMessageInputExcludingMessage(process.argv[2] ?? '')
    );
  } catch (error) {
    process.stderr.write(extractErrorMessage(error));
    process.exit(1);
  }
  process.stdout.write(messageSignature);
  process.exit(0);
}
