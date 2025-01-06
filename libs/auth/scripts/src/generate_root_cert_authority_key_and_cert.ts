import fs from 'node:fs/promises';
import path from 'node:path';
import yargs from 'yargs';
import { extractErrorMessage } from '@votingworks/basics';

import { CERT_EXPIRY_IN_DAYS } from '../../src/certs';
import { generatePrivateKey, generateSelfSignedCert } from './utils';

interface GenerateRootCertAuthorityKeyAndCertInput {
  commonName: string;
  outputDir: string;
}

async function parseCommandLineArgs(
  args: readonly string[]
): Promise<GenerateRootCertAuthorityKeyAndCertInput> {
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

  if (parsedArgs.help || !parsedArgs.commonName || !parsedArgs.outputDir) {
    console.log(helpMessage);
    process.exit(parsedArgs.help ? 0 : 1);
  }

  return {
    commonName: parsedArgs.commonName,
    outputDir: parsedArgs.outputDir,
  };
}

async function generateRootCertAuthorityKeyAndCert({
  commonName,
  outputDir,
}: GenerateRootCertAuthorityKeyAndCertInput): Promise<void> {
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
 * A script for generating a root cert authority key and cert.
 */
export async function main(args: readonly string[]): Promise<void> {
  try {
    const userInputs = await parseCommandLineArgs(args);
    await generateRootCertAuthorityKeyAndCert(userInputs);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
