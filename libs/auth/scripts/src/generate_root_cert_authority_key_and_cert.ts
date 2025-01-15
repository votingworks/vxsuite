import * as fs from 'node:fs/promises';
import path from 'node:path';
import yargs from 'yargs';
import { extractErrorMessage } from '@votingworks/basics';

import { CERT_EXPIRY_IN_DAYS } from '../../src/certs';
import { generatePrivateKey, generateSelfSignedCert } from './utils';

interface CommandLineArgs {
  commonName: string;
  outputDir: string;
}

async function parseCommandLineArgs(
  args: readonly string[]
): Promise<CommandLineArgs> {
  const argParser = yargs()
    .options({
      'common-name': {
        description: 'The common name to use in the cert subject',
        type: 'string',
      },
      'output-dir': {
        description: 'The directory to output the generated key and cert to',
        type: 'string',
      },
    })
    .hide('help')
    .version(false)
    .example('$ generate-root-cert-authority-key-and-cert --help', '')
    .example(
      '$ generate-root-cert-authority-key-and-cert \\\n' +
        '--common-name "VotingWorks Development" --output-dir path/to/output-dir',
      ''
    )
    .strict();

  const helpMessage = await argParser.getHelp();
  argParser.fail((errorMessage: string) => {
    throw new Error(`${errorMessage}\n\n${helpMessage}`);
  });

  const parsedArgs = argParser.parse(args) as {
    commonName?: string;
    help?: boolean;
    outputDir?: string;
  };

  if (parsedArgs.help) {
    console.log(helpMessage);
    process.exit(0);
  }

  if (!parsedArgs.commonName || !parsedArgs.outputDir) {
    throw new Error(helpMessage);
  }

  return {
    commonName: parsedArgs.commonName,
    outputDir: parsedArgs.outputDir,
  };
}

async function generateRootCertAuthorityKeyAndCert({
  commonName,
  outputDir,
}: CommandLineArgs): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  const privateKeyPath = path.join(outputDir, 'private-key.pem');
  const certPath = path.join(outputDir, 'cert.pem');

  console.log('🔑 Generating private key');
  const privateKey = await generatePrivateKey({ encrypted: true });
  await fs.writeFile(privateKeyPath, privateKey);
  console.log(`Private key written to: ${privateKeyPath}\n`);

  console.log('🔏 Generating cert');
  const cert = await generateSelfSignedCert({
    privateKeyPath,
    commonName,
    expiryDays: CERT_EXPIRY_IN_DAYS.ROOT_CERT_AUTHORITY_CERT,
  });
  await fs.writeFile(certPath, cert);
  console.log(`Cert written to: ${certPath}\n`);

  console.log('✅ Done!');
}

/**
 * A script for generating a root cert authority key and cert
 */
export async function main(args: readonly string[]): Promise<void> {
  try {
    const commandLineArgs = await parseCommandLineArgs(args);
    await generateRootCertAuthorityKeyAndCert(commandLineArgs);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
