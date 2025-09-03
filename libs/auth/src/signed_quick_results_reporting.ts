import { Readable } from 'node:stream';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { compressTally } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { constructPrefixedMessage } from './signatures';
import { signMessage } from './cryptography';
import {
  constructSignedQuickResultsReportingConfig,
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
  console.log(JSON.stringify(compressedTally));

  const messagePayloadParts = [
    ballotHash,
    signingMachineId,
    isLiveMode ? '1' : '0',
    secondsSince1970.toString(),
    3, // fake data to mimick having an integer for index of precinct in election def
    // Buffer.from(JSON.stringify(compressedTally)).toString('base64'),
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
  const machineCertString = machineCert
    .toString('utf-8')
    // Remove the standard PEM header and footer to make the QR code as small as possible
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '');
  assert(certDetails.component !== 'card');

  const signedQuickResultsReportingUrl = `${quickResultsReportingUrl}/?p=${encodeURIComponent(
    message
  )}&s=${encodeURIComponent(
    messageSignature.toString('base64url')
  )}&c=${machineCertString}&r=`;
  const sizeInBytes = Buffer.byteLength(signedQuickResultsReportingUrl, 'utf8');
  console.log('backed overhead size in bytes', sizeInBytes);
  return signedQuickResultsReportingUrl;
}
