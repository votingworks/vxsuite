import { safeParseElectionDefinition } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const electionJson = readFileSync(join(__dirname, 'election.json'), 'utf8');

/**
 * Full election definition for Franklin County General Election.
 */
export const electionDefinition =
  safeParseElectionDefinition(electionJson).unsafeUnwrap();

/**
 * Election definition for Franklin County General Election.
 */
export const { election } = electionDefinition;

/**
 * Path to the ballot package ZIP file for Franklin County General Election.
 */
export const ballotPackage = join(
  __dirname,
  'franklin-county_lincoln-municipal-general-election_5c6ed04c64.zip'
);

/**
 * Path to page 1 of an undervoted ballot for Franklin County General Election.
 */
export const sampleBallotUndervotePage1 = join(
  __dirname,
  'sample-ballot-undervotes-p1.jpeg'
);

/**
 * Path to page 2 of an undervoted ballot for Franklin County General Election.
 */
export const sampleBallotUndervotePage2 = join(
  __dirname,
  'sample-ballot-undervotes-p2.jpeg'
);
