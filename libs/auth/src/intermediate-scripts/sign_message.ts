import { Buffer } from 'node:buffer';
import { extractErrorMessage } from '@votingworks/basics';

import {
  deserializeSignMessageInputExcludingMessage,
  signMessageHelper,
} from '../cryptography';

/**
 * An intermediate component of signMessage in src/cryptography.ts, needed for permissions
 * purposes. See signMessage for more context.
 */
export async function main(): Promise<void> {
  let messageSignature: Buffer;
  try {
    messageSignature = await signMessageHelper(
      deserializeSignMessageInputExcludingMessage(process.argv[2] ?? '')
    );
  } catch (error) {
    process.stderr.write(extractErrorMessage(error));
    process.exit(1);
  }
  process.stdout.write(messageSignature);
  process.exit(0);
}
