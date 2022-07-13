import {
  Election,
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';

// Objects with election information grouped with any other data files that may be useful for testing
// with that election. When adding new data files, make sure to add new tests in index.test.ts to make sure the
// raw file and the ts extension stay in sync.
import { multiPartyPrimaryElectionCsvData } from './data/electionMultiPartyPrimary/csvFiles/batch_results.csv';
import { multiPartyPrimaryElectionCvrData } from './data/electionMultiPartyPrimary/cvrFiles/standard.jsonl';
import { asText as multiPartyPrimaryElectionAsText } from './data/electionMultiPartyPrimary/electionMultiPartyPrimarySample.json';
import { multiPartyPrimaryElectionSemsData } from './data/electionMultiPartyPrimary/semsFiles/standard.csv';
import { simplePrimaryElectionCvrData } from './data/electionPrimary/cvrFiles/standard.txt';
import { asText as primaryElectionSampleAsText } from './data/electionPrimary/electionPrimarySample.json';
import { asText as electionSampleAsText } from './data/electionSample.json';
import { electionSample2CvrSmall1 } from './data/electionSample2/cvrFiles/small1.txt';
import { electionSample2CvrSmall2 } from './data/electionSample2/cvrFiles/small2.txt';
import { electionSample2CvrSmall3 } from './data/electionSample2/cvrFiles/small3.txt';
import { electionSample2CvrStandard1 } from './data/electionSample2/cvrFiles/standard.txt';
import { electionSample2CvrStandard2 } from './data/electionSample2/cvrFiles/standard2.txt';
import { asText as electionSample2AsText } from './data/electionSample2/election.json';
import { asText as electionSampleLongContentAsText } from './data/electionSampleLongContent.json';
import { asText as electionSampleRotationAsText } from './data/electionSampleRotation.json';
import { msEitherNeitherElectionCvrData } from './data/electionWithMsEitherNeither/cvrFiles/standard.jsonl';
import { msEitherNeitherElectionCvrTestData } from './data/electionWithMsEitherNeither/cvrFiles/test.jsonl';
import { asText as electionWithMsEitherNeitherAsText } from './data/electionWithMsEitherNeither/electionWithMsEitherNeither.json';
import { msEitherNeitherElectionSemsData } from './data/electionWithMsEitherNeither/semsFiles/standard.csv';
import { asText as electionMinimalExhaustiveSampleAsText } from './data/electionMinimalExhaustiveSample/electionMinimalExhaustiveSample.json';
import { electionMinimalExhaustiveCvrData } from './data/electionMinimalExhaustiveSample/cvrFiles/standard.jsonl';
import { electionMinimalExhaustiveSemsData } from './data/electionMinimalExhaustiveSample/semsFiles/standard.csv';
import { asText as electionMinimalExhaustiveSampleRightSideTargetsAsText } from './data/electionMinimalExhaustiveSampleRightSideTargets/electionMinimalExhaustiveSampleRightSideTargets.json';
import { asText as electionSampleNoSealAsText } from './data/electionSampleNoSeal.json';

export * as electionFamousNames2021Fixtures from './data/electionFamousNames2021';

export function asElectionDefinition(election: Election): ElectionDefinition {
  const electionData = JSON.stringify(election);
  return {
    election,
    electionData,
    electionHash: sha256(electionData),
  };
}

export const electionSampleDefinition = safeParseElectionDefinition(
  electionSampleAsText()
).unsafeUnwrap();
export const electionSample2Definition = safeParseElectionDefinition(
  electionSample2AsText()
).unsafeUnwrap();
export const primaryElectionSampleDefinition = safeParseElectionDefinition(
  primaryElectionSampleAsText()
).unsafeUnwrap();
export const multiPartyPrimaryElectionDefinition = safeParseElectionDefinition(
  multiPartyPrimaryElectionAsText()
).unsafeUnwrap();
export const electionSampleLongContentDefinition = safeParseElectionDefinition(
  electionSampleLongContentAsText()
).unsafeUnwrap();
export const electionSampleRotationDefinition = safeParseElectionDefinition(
  electionSampleRotationAsText()
).unsafeUnwrap();
export const electionWithMsEitherNeitherDefinition =
  safeParseElectionDefinition(
    electionWithMsEitherNeitherAsText()
  ).unsafeUnwrap();
export const electionMinimalExhaustiveSampleDefinition =
  safeParseElectionDefinition(
    electionMinimalExhaustiveSampleAsText()
  ).unsafeUnwrap();
export const electionMinimalExhaustiveSampleRightSideTargetsDefinition =
  safeParseElectionDefinition(
    electionMinimalExhaustiveSampleRightSideTargetsAsText()
  ).unsafeUnwrap();
export const electionSampleNoSealDefinition = safeParseElectionDefinition(
  electionSampleNoSealAsText()
).unsafeUnwrap();

export const electionSample = electionSampleDefinition.election;
export const electionSample2 = electionSample2Definition.election;
export const primaryElectionSample = primaryElectionSampleDefinition.election;
export const multiPartyPrimaryElection =
  multiPartyPrimaryElectionDefinition.election;
export const electionSampleLongContent =
  electionSampleLongContentDefinition.election;
export const electionSampleRotation = electionSampleRotationDefinition.election;
export const electionWithMsEitherNeither =
  electionWithMsEitherNeitherDefinition.election;
export const electionMinimalExhaustiveSample =
  electionMinimalExhaustiveSampleDefinition.election;
export const electionMinimalExhaustiveSampleRightSideTargets =
  electionMinimalExhaustiveSampleRightSideTargetsDefinition.election;
export const electionSampleNoSeal = electionSampleNoSealDefinition.election;

export const electionWithMsEitherNeitherRawData =
  electionWithMsEitherNeitherAsText();

export const electionMultiPartyPrimaryWithDataFiles = {
  electionDefinition: multiPartyPrimaryElectionDefinition,
  semsData: multiPartyPrimaryElectionSemsData,
  cvrData: multiPartyPrimaryElectionCvrData,
  csvData: multiPartyPrimaryElectionCsvData,
} as const;

export const electionSimplePrimaryWithDataFiles = {
  electionDefinition: primaryElectionSampleDefinition,
  cvrData: simplePrimaryElectionCvrData,
} as const;

export const electionSample2WithDataFiles = {
  electionDefinition: electionSample2Definition,
  cvrDataSmall1: electionSample2CvrSmall1,
  cvrDataSmall2: electionSample2CvrSmall2,
  cvrDataSmall3: electionSample2CvrSmall3,
  cvrDataStandard1: electionSample2CvrStandard1,
  cvrDataStandard2: electionSample2CvrStandard2,
} as const;

export const electionWithMsEitherNeitherWithDataFiles = {
  electionDefinition: electionWithMsEitherNeitherDefinition,
  semsData: msEitherNeitherElectionSemsData,
  cvrData: msEitherNeitherElectionCvrData,
  cvrTestData: msEitherNeitherElectionCvrTestData,
} as const;

export const electionMinimalExhaustiveSampleWithDataFiles = {
  electionDefinition: electionMinimalExhaustiveSampleDefinition,
  semsData: electionMinimalExhaustiveSemsData,
  cvrData: electionMinimalExhaustiveCvrData,
} as const;
