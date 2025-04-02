import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { compressTally } from '@votingworks/utils';
import { constructPrefixedMessage } from './signatures';
import { signMessage } from './cryptography';
import { constructSignedQuickResultsReportingConfig } from './config';

interface SignedQuickResultsReportingUrlProps {
  electionDefinition: ElectionDefinition;
  quickResultsReportingUrl: string;
  signingMachineId: string;
  isLiveMode: boolean;
  results: Tabulation.ElectionResults;
}

/**
 * The separator between parts of the signed quick results reporting message payload
 */
const SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR = '.';

/**
 * Returns the URL to encode as a QR code for quick results reporting, including a signed payload
 * containing the election results
 */
export async function getSignedQuickResultsReportingUrl(
  {
    electionDefinition,
    quickResultsReportingUrl,
    signingMachineId,
    isLiveMode,
    results,
  }: SignedQuickResultsReportingUrlProps,
  signingConfig = constructSignedQuickResultsReportingConfig()
): Promise<string> {
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
    signingPrivateKey: signingConfig.machinePrivateKey,
  });
  const signedQuickResultsReportingUrl = `${quickResultsReportingUrl}/?p=${encodeURIComponent(
    message
  )}&s=${encodeURIComponent(messageSignature.toString('base64url'))}`;
  return signedQuickResultsReportingUrl;
}
