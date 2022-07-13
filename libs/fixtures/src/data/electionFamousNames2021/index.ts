import { safeParseElectionDefinition } from '@votingworks/types';
import { asText as electionAsText } from './election.json';

/**
 * Full election definition for Franklin County General Election.
 */
export const electionDefinition = safeParseElectionDefinition(
  electionAsText()
).unsafeUnwrap();

/**
 * Election definition for Franklin County General Election.
 */
export const { election } = electionDefinition;

export { asBuffer as ballotPdfAsBuffer } from './ballot.pdf';
export { asBuffer as ballotPackageAsBuffer } from './ballot-package.zip';
export { asImageData as sampleBallotUndervotePage1AsImageData } from './sample-ballot-undervotes-p1.jpeg';
export { asImageData as sampleBallotUndervotePage2AsImageData } from './sample-ballot-undervotes-p2.jpeg';
