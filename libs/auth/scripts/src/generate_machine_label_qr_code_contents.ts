import { Readable } from 'node:stream';
import yargs from 'yargs/yargs';
import { extractErrorMessage } from '@votingworks/basics';

import { signMessage } from '../../src/cryptography';
import { FileKey } from '../../src/keys';
import { constructPrefixedMessage } from '../../src/signatures';

interface CommandLineArgs {
  privateKeyPath: string;
  privateKeyPassphraseFilePath?: string;
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
      'private-key-passphrase-file-path': {
        description:
          'The path to the passphrase file for the VotingWorks label QR codes private key. ' +
          'If not provided, the passphrase will have to be entered interactively.',
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
    .example(
      '$ generate-machine-label-qr-code-contents \\\n' +
        '--private-key-path path/to/private-key.pem \\\n' +
        '--private-key-passphrase-file-path path/to/passphrase.txt \\\n' +
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
    privateKeyPassphraseFilePath?: string;
    privateKeyPath?: string;
  };

  if (parsedArgs.help) {
    console.log(helpMessage);
    process.exit(0);
  }

  if (!parsedArgs.serialNumber || !parsedArgs.privateKeyPath) {
    console.error(helpMessage);
    process.exit(1);
  }

  return {
    serialNumber: parsedArgs.serialNumber,
    privateKeyPassphraseFilePath: parsedArgs.privateKeyPassphraseFilePath,
    privateKeyPath: parsedArgs.privateKeyPath,
  };
}

async function generateMachineLabelQrCodeContents({
  privateKeyPath,
  privateKeyPassphraseFilePath,
  serialNumber,
}: CommandLineArgs): Promise<void> {
  const signingPrivateKey: FileKey = {
    source: 'file',
    path: privateKeyPath,
    passphraseFilePath: privateKeyPassphraseFilePath,
  };
  const message = constructPrefixedMessage(
    'signed-serial-number',
    `sn=${serialNumber}`
  );
  const signature = await signMessage({
    message: Readable.from(message),
    signingPrivateKey,
  });
  // Encode the signature using base64URL encoding, a URL-safe variant of base64 encoding:
  // https://en.wikipedia.org/wiki/Base64#URL_applications
  const urlSafeBase64Signature = signature
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
