import { Election, ElectionDefinition } from '@votingworks/types';
import { sha256 } from 'js-sha256';

// Objects with election information grouped with any other data files that may be useful for testing
// with that election. When adding new data files, make sure to add new tests in index.test.ts to make sure the
// raw file and the ts extension stay in sync.
import { multiPartyPrimaryElectionCSVData } from './data/electionMultiPartyPrimary/csvFiles/batch_results.csv';
import { multiPartyPrimaryElectionCvrData } from './data/electionMultiPartyPrimary/cvrFiles/standard.jsonl';
import multiPartyPrimaryElectionUntyped from './data/electionMultiPartyPrimary/electionMultiPartyPrimarySample.json';
import { multiPartyPrimaryElectionSemsData } from './data/electionMultiPartyPrimary/semsFiles/standard.csv';
import { simplePrimaryElectionCvrData } from './data/electionPrimary/cvrFiles/standard.txt';
import primaryElectionSampleUntyped from './data/electionPrimary/electionPrimarySample.json';
import electionSampleUntyped from './data/electionSample.json';
import { electionSample2CvrSmall1 } from './data/electionSample2/cvrFiles/small1.txt';
import { electionSample2CvrSmall2 } from './data/electionSample2/cvrFiles/small2.txt';
import { electionSample2CvrSmall3 } from './data/electionSample2/cvrFiles/small3.txt';
import { electionSample2CvrStandard1 } from './data/electionSample2/cvrFiles/standard.txt';
import { electionSample2CvrStandard2 } from './data/electionSample2/cvrFiles/standard2.txt';
import electionSample2Untyped from './data/electionSample2/election.json';
import electionSampleLongContentUntyped from './data/electionSampleLongContent.json';
import electionSampleRotationUntyped from './data/electionSampleRotation.json';
import { msEitherNeitherElectionCvrData } from './data/electionWithMsEitherNeither/cvrFiles/standard.jsonl';
import electionWithMsEitherNeitherUntyped from './data/electionWithMsEitherNeither/electionWithMsEitherNeither.json';
import { msEitherNeitherElectionSemsData } from './data/electionWithMsEitherNeither/semsFiles/standard.csv';
import electionMinimalExhaustiveSampleUntyped from './data/electionMinimalExhaustiveSample/electionMinimalExhaustiveSample.json';
import { electionMinimalExhaustiveCvrData } from './data/electionMinimalExhaustiveSample/cvrFiles/standard.jsonl';
import { electionMinimalExhaustiveSemsData } from './data/electionMinimalExhaustiveSample/semsFiles/standard.csv';

export function asElectionDefinition(election: Election): ElectionDefinition {
  const electionData = JSON.stringify(election);
  return {
    election,
    electionData,
    electionHash: sha256(electionData),
  };
}

export const electionSample = (electionSampleUntyped as unknown) as Election;
export const electionSample2 = (electionSample2Untyped as unknown) as Election;
export const primaryElectionSample = (primaryElectionSampleUntyped as unknown) as Election;
export const multiPartyPrimaryElection = (multiPartyPrimaryElectionUntyped as unknown) as Election;
export const electionSampleLongContent = (electionSampleLongContentUntyped as unknown) as Election;
export const electionSampleRotation = (electionSampleRotationUntyped as unknown) as Election;
export const electionWithMsEitherNeither = (electionWithMsEitherNeitherUntyped as unknown) as Election;
export const electionMinimalExhaustiveSample = (electionMinimalExhaustiveSampleUntyped as unknown) as Election;

export const electionSampleDefinition = asElectionDefinition(electionSample);
export const electionSample2Definition = asElectionDefinition(electionSample2);
export const primaryElectionSampleDefinition = asElectionDefinition(
  primaryElectionSample
);
export const multiPartyPrimaryElectionDefinition = asElectionDefinition(
  multiPartyPrimaryElection
);
export const electionSampleLongContentDefinition = asElectionDefinition(
  electionSampleLongContent
);
export const electionSampleRotationDefinition = asElectionDefinition(
  electionSampleRotation
);
export const electionWithMsEitherNeitherDefinition = asElectionDefinition(
  electionWithMsEitherNeither
);
export const electionMinimalExhaustiveSampleDefinition = asElectionDefinition(
  electionMinimalExhaustiveSample
);

export const electionWithMsEitherNeitherRawData = JSON.stringify(
  electionWithMsEitherNeitherUntyped
);

export const electionMultiPartyPrimaryWithDataFiles = {
  electionDefinition: multiPartyPrimaryElectionDefinition,
  semsData: multiPartyPrimaryElectionSemsData as string,
  cvrData: multiPartyPrimaryElectionCvrData as string,
  csvData: multiPartyPrimaryElectionCSVData as string,
} as const;

export const electionSimplePrimaryWithDataFiles = {
  electionDefinition: primaryElectionSampleDefinition,
  cvrData: simplePrimaryElectionCvrData,
} as const;

export const electionSample2WithDataFiles = {
  electionDefinition: electionSample2Definition,
  cvrDataSmall1: electionSample2CvrSmall1 as string,
  cvrDataSmall2: electionSample2CvrSmall2 as string,
  cvrDataSmall3: electionSample2CvrSmall3 as string,
  cvrDataStandard1: electionSample2CvrStandard1 as string,
  cvrDataStandard2: electionSample2CvrStandard2 as string,
} as const;

export const electionWithMsEitherNeitherWithDataFiles = {
  electionDefinition: electionWithMsEitherNeitherDefinition,
  semsData: msEitherNeitherElectionSemsData as string,
  cvrData: msEitherNeitherElectionCvrData as string,
} as const;

export const electionMinimalExhaustiveSampleWithDataFiles = {
  electionDefinition: electionMinimalExhaustiveSampleDefinition,
  semsData: electionMinimalExhaustiveSemsData as string,
  cvrData: electionMinimalExhaustiveCvrData as string,
} as const;
