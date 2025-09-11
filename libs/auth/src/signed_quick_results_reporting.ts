import { Readable } from 'node:stream';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { assert, err, ok, Result } from '@votingworks/basics';
import { compressTally } from '@votingworks/utils';
import { constructPrefixedMessage } from './signatures';
import {
  extractPublicKeyFromCert,
  signMessage,
  verifyFirstCertWasSignedBySecondCert,
  verifySignature,
} from './cryptography';
import {
  constructSignedQuickResultsReportingConfig,
  getVxCertAuthorityCertPath,
  SignedQuickResultsReportingConfig,
} from './config';
import { parseCert } from './certs';

interface SignedQuickResultsReportingInput {
  electionDefinition: ElectionDefinition;
  isLiveMode: boolean;
  quickResultsReportingUrl: string;
  results: Tabulation.ElectionResults;
  signingMachineId: string;
}

const CERT_PEM_HEADER = '-----BEGIN CERTIFICATE-----';
const CERT_PEM_FOOTER = '-----END CERTIFICATE-----';

/**
 * The separator between parts of the signed quick results reporting message payload
 */
const SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR = '.';

/**
 * Returns the URL to encode as a QR code for quick results reporting, including a signed payload
 * containing the election results
 */
export async function generateSignedQuickResultsReportingUrl(
  {
    electionDefinition,
    isLiveMode,
    quickResultsReportingUrl,
    results,
    signingMachineId,
  }: SignedQuickResultsReportingInput,
  configOverride?: SignedQuickResultsReportingConfig
): Promise<string> {
  const config =
    configOverride ??
    /* istanbul ignore next - @preserve */ constructSignedQuickResultsReportingConfig();

  const { ballotHash, election } = electionDefinition;
  const compressedTally = compressTally(election, results);
  const secondsSince1970 = Math.round(new Date().getTime() / 1000);

  const messagePayloadParts = [
    ballotHash,
    signingMachineId,
    isLiveMode ? '1' : '0',
    secondsSince1970.toString(),
    Buffer.from(JSON.stringify(compressedTally)).toString('base64'),
  ];
  const messagePayload = messagePayloadParts.join(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );
  const message = constructPrefixedMessage('qr1', messagePayload);
  const messageSignature = await signMessage({
    message: Readable.from(message),
    signingPrivateKey: config.machinePrivateKey,
  });

  const machineCert = await fs.readFile(config.machineCertPath);
  const certDetails = await parseCert(machineCert);
  assert(certDetails.component !== 'card');

  // Extract the certificate content, decode from PEM base64 to binary DER, then encode as base64url
  const machineCertContent = machineCert
    .toString('utf-8')
    // Remove the standard PEM header and footer to get the base64 content
    .replace(CERT_PEM_HEADER, '')
    .replace(CERT_PEM_FOOTER, '');

  const params = new URLSearchParams({
    p: message,
    s: messageSignature.toString('base64url'),
    c: machineCertContent,
  });
  const signedQuickResultsReportingUrl = `${quickResultsReportingUrl}?${params.toString()}`;
  return signedQuickResultsReportingUrl;
}
/**
 * Verifies that the provided signature is valid for the given payload and was signed by the key that the public certificate is for.
 * Additionally verifies that the certificate why signed by the trusted certificate authority.
 * If any error occurs during verification, 'invalid-signature' is returned.
 * Otherwise, void is returned to indicate success.
 */
export async function authenticateSignedQuickResultsReportingUrl(
  payload: string,
  signature: string,
  rawCertificate: string,
  caCertPath?: string
): Promise<Result<void, 'invalid-signature'>> {
  // Verify the signature and certificate
  // Convert base64url back to binary DER, then to PEM format
  const certificateDer = Buffer.from(rawCertificate, 'base64url');
  const certificateBase64 = certificateDer.toString('base64');
  const certificate = Buffer.from(
    `${CERT_PEM_HEADER}\n${certificateBase64}\n${CERT_PEM_FOOTER}`
  );

  const cacPath =
    caCertPath ??
    /* istanbul ignore next - @preserve */ getVxCertAuthorityCertPath();

  try {
    const publicKey = await extractPublicKeyFromCert(Buffer.from(certificate));
    await verifyFirstCertWasSignedBySecondCert(certificate, cacPath);
    await verifySignature({
      message: Buffer.from(payload),
      messageSignature: Buffer.from(signature, 'base64url'),
      publicKey,
    });
  } catch (e) {
    return err('invalid-signature');
  }

  return ok();
}
