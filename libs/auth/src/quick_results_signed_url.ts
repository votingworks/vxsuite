import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { compressTally } from '@votingworks/utils';
import { constructPrefixedMessage } from './signatures';
import { signMessage } from './cryptography';
import { constructSignedQuickResultsReportingConfig } from './config';

interface SignedQuickResultsReportingUrlProps {
  electionDefinition: ElectionDefinition;
  signingMachineId: string;
  isLiveMode: boolean;
  results: Tabulation.ElectionResults;
}

/**
 * Returns the URL to encode as a QR Code for quick results reporting.
 * Encoded data is a URL to the quick results reporting page with a signed payload representing the election results.
 */
export async function getSignedQuickResultsReportingUrl(
  {
    electionDefinition,
    signingMachineId,
    isLiveMode,
    results,
  }: SignedQuickResultsReportingUrlProps,
  signingConfig = constructSignedQuickResultsReportingConfig()
): Promise<string> {
  const { ballotHash, election } = electionDefinition;
  console.log('hi');
  const quickReportingUrl = election.quickResultsReportingUrl;
  if (!quickReportingUrl) {
    console.log(election);
    return '';
  }
  /* if (quickReportingUrl.startsWith('http://localhost')) {
    quickReportingUrl = 'http://10.211.55.5:5000';
  } */
  const compressedTally = compressTally(election, results);
  const secondsSince1970 = Math.round(new Date().getTime() / 1000);
  const stringToSign = `${ballotHash}.${signingMachineId}.${
    isLiveMode ? '1' : '0'
  }.${secondsSince1970}.${Buffer.from(JSON.stringify(compressedTally)).toString(
    'base64'
  )}`;
  const message = constructPrefixedMessage('shv1', stringToSign);
  const messageSignature = await signMessage({
    message: Readable.from(message),
    signingPrivateKey: signingConfig.machinePrivateKey,
  });

  const url = `${quickReportingUrl}/?p=${encodeURIComponent(
    message
  )}&s=${encodeURIComponent(messageSignature.toString('base64url'))}}`;
  console.log('encoded url is:');
  console.log(url);
  return url;
}
