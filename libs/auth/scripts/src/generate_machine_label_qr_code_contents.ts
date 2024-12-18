import path from 'node:path';
import { Readable } from 'node:stream';
import yargs from 'yargs/yargs';
import { extractErrorMessage } from '@votingworks/basics';

import {
  extractPublicKeyFromCert,
  signMessage,
  verifySignature,
} from '../../src/cryptography';
import { FileKey } from '../../src/keys';
import { constructPrefixedMessage } from '../../src/signatures';

interface CommandLineArgs {
  privateKeyPath: string;
  serialNumber: string;
}

async function parseCommandLineArgs(
  args: readonly string[]
): Promise<CommandLineArgs> {
  const argParser = yargs()
    .options({
      'private-key-path': {
        description:
          'The path to the VotingWorks label QR codes private key. ' +
          'This is not the same key as our root private key.',
        type: 'string',
      },
      'serial-number': {
        description:
          'The machine serial number, also referred to as the machine ID',
        type: 'string',
      },
    })
    .hide('help')
    .version(false)
    .example('$ generate-machine-label-qr-code-contents --help', '')
    .example(
      '$ generate-machine-label-qr-code-contents \\\n' +
        '--private-key-path path/to/private-key.pem \\\n' +
        '--serial-number SC-00-000',
      ''
    )
    .strict();

  const helpMessage = await argParser.getHelp();
  argParser.fail((errorMessage: string) => {
    throw new Error(`${errorMessage}\n\n${helpMessage}`);
  });

  const parsedArgs = argParser.parse(args) as {
    help?: boolean;
    serialNumber?: string;
    privateKeyPath?: string;
  };

  if (parsedArgs.help) {
    console.log(helpMessage);
    process.exit(0);
  }

  if (!parsedArgs.privateKeyPath || !parsedArgs.serialNumber) {
    console.error(helpMessage);
    process.exit(1);
  }

  return {
    privateKeyPath: parsedArgs.privateKeyPath,
    serialNumber: parsedArgs.serialNumber,
  };
}

async function generateMachineLabelQrCodeContents({
  privateKeyPath,
  serialNumber,
}: CommandLineArgs): Promise<void> {
  const signingPrivateKey: FileKey = {
    source: 'file',
    path: privateKeyPath,
  };
  const message = constructPrefixedMessage(
    'signed-serial-number',
    `sn=${serialNumber}`
  );
  const messageSignature = await signMessage({
    message: Readable.from(message),
    signingPrivateKey,
  });

  const certPath = path.join(
    __dirname,
    '../../certs/prod/vx-label-qr-codes-cert-authority-cert.pem'
  );
  const publicKey = await extractPublicKeyFromCert(certPath);
  try {
    await verifySignature({
      message: Readable.from(message),
      messageSignature,
      publicKey,
    });
  } catch (error) {
    throw new Error(
      "Unable to verify signature. Make sure that you're using the correct private key."
    );
  }

  // Encode the signature using base64URL encoding, a URL-safe variant of base64 encoding:
  // https://en.wikipedia.org/wiki/Base64#URL_applications
  const urlSafeBase64Signature = messageSignature
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  console.log(`https://vxqr.org/sn/${serialNumber}#${urlSafeBase64Signature}`);
}

/**
 * A script for generating machine label QR code contents
 */
export async function main(args: readonly string[]): Promise<void> {
  try {
    const commandLineArgs = await parseCommandLineArgs(args);
    await generateMachineLabelQrCodeContents(commandLineArgs);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
