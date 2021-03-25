import { Election, ElectionDefinition } from '@votingworks/types'
import { sha256 } from 'js-sha256'

import electionSampleUntyped from './data/electionSample.json'
import electionSample2Untyped from './data/electionSample2/election.json'
import primaryElectionSampleUntyped from './data/electionPrimary/electionPrimarySample.json'
import multiPartyPrimaryElectionUntyped from './data/electionMultiPartyPrimary/electionMultiPartyPrimarySample.json'
import electionSampleLongContentUntyped from './data/electionSampleLongContent.json'
import electionWithMsEitherNeitherUntyped from './data/electionWithMsEitherNeither/electionWithMsEitherNeither.json'

export function asElectionDefinition(
  election: Election
): ElectionDefinition & { electionData: string } {
  const electionData = JSON.stringify(election)
  return {
    election,
    electionData,
    electionHash: sha256(electionData),
  }
}

export const electionSample = (electionSampleUntyped as unknown) as Election
export const electionSample2 = (electionSample2Untyped as unknown) as Election
export const primaryElectionSample = (primaryElectionSampleUntyped as unknown) as Election
export const multiPartyPrimaryElection = (multiPartyPrimaryElectionUntyped as unknown) as Election
export const electionSampleLongContent = (electionSampleLongContentUntyped as unknown) as Election
export const electionWithMsEitherNeither = (electionWithMsEitherNeitherUntyped as unknown) as Election

export const electionSampleDefinition = asElectionDefinition(electionSample)
export const electionSample2Definition = asElectionDefinition(electionSample2)
export const primaryElectionSampleDefinition = asElectionDefinition(
  primaryElectionSample
)
export const multiPartyPrimaryElectionDefinition = asElectionDefinition(
  multiPartyPrimaryElection
)
export const electionSampleLongContentDefinition = asElectionDefinition(
  electionSampleLongContent
)
export const electionWithMsEitherNeitherDefinition = asElectionDefinition(
  electionWithMsEitherNeither
)

export const electionWithMsEitherNeitherRawData = JSON.stringify(
  electionWithMsEitherNeitherUntyped
)

// Objects with election information grouped with any other data files that may be useful for testing
// with that election. When adding new data files, make sure to add new tests in index.test.ts to make sure the
// raw file and the ts extension stay in sync.

import multiPartiPrimaryElectionSEMSData from './data/electionMultiPartyPrimary/semsFiles/standard.csv'
import multiPartiPrimaryElectionCVRData from './data/electionMultiPartyPrimary/cvrFiles/standard.jsonl'

export const electionMultiPartyPrimaryWithDataFiles = {
  electionDefinition: multiPartyPrimaryElectionDefinition,
  semsData: multiPartiPrimaryElectionSEMSData,
  cvrData: multiPartiPrimaryElectionCVRData,
}

import simplePrimaryElectionCVRData from './data/electionPrimary/cvrFiles/standard.txt'

export const electionSimplePrimaryWithDataFiles = {
  electionDefinition: primaryElectionSampleDefinition,
  cvrData: simplePrimaryElectionCVRData,
}

import electionSample2CVRSmall1 from './data/electionSample2/cvrFiles/small1.txt'
import electionSample2CVRSmall2 from './data/electionSample2/cvrFiles/small2.txt'
import electionSample2CVRSmall3 from './data/electionSample2/cvrFiles/small3.txt'
import electionSample2CVRStandard1 from './data/electionSample2/cvrFiles/standard.txt'
import electionSample2CVRStandard2 from './data/electionSample2/cvrFiles/standard2.txt'

export const electionSample2WithDataFiles = {
  electionDefinition: electionSample2Definition,
  cvrDataSmall1: electionSample2CVRSmall1,
  cvrDataSmall2: electionSample2CVRSmall2,
  cvrDataSmall3: electionSample2CVRSmall3,
  cvrDataStandard1: electionSample2CVRStandard1,
  cvrDataStandard2: electionSample2CVRStandard2,
}

import msEitherNeitherElectionSEMSData from './data/electionWithMsEitherNeither/semsFiles/standard.csv'
import msEitherNeitherElectionCVRData from './data/electionWithMsEitherNeither/cvrFiles/standard.jsonl'

export const electionWithMsEitherNeitherWithDataFiles = {
  electionDefinition: electionWithMsEitherNeitherDefinition,
  semsData: msEitherNeitherElectionSEMSData,
  cvrData: msEitherNeitherElectionCVRData,
}
