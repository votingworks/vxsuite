import { readFileSync } from 'fs'
import { join } from 'path'
import {
  Election,
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types'

export function loadElectionDefinition(path: string): ElectionDefinition {
  return safeParseElectionDefinition(readFileSync(path, 'utf-8')).unwrap()
}

export const electionSampleDefinition = loadElectionDefinition(
  join(__dirname, './data/electionSample.json')
)
export const electionSample2Definition = loadElectionDefinition(
  join(__dirname, './data/electionSample2/election.json')
)
export const primaryElectionSampleDefinition = loadElectionDefinition(
  join(__dirname, './data/electionPrimary/electionPrimarySample.json')
)
export const multiPartyPrimaryElectionDefinition = loadElectionDefinition(
  join(
    __dirname,
    './data/electionMultiPartyPrimary/electionMultiPartyPrimarySample.json'
  )
)
export const electionSampleLongContentDefinition = loadElectionDefinition(
  join(__dirname, './data/electionSampleLongContent.json')
)
export const electionWithMsEitherNeitherDefinition = loadElectionDefinition(
  join(
    __dirname,
    './data/electionWithMsEitherNeither/electionWithMsEitherNeither.json'
  )
)

export function asElectionDefinition(election: Election): ElectionDefinition {
  return safeParseElectionDefinition(JSON.stringify(election)).unwrap()
}

export const electionSample = electionSampleDefinition.election
export const electionSample2 = electionSample2Definition.election
export const primaryElectionSample = primaryElectionSampleDefinition.election
export const multiPartyPrimaryElection =
  multiPartyPrimaryElectionDefinition.election
export const electionSampleLongContent =
  electionSampleLongContentDefinition.election
export const electionWithMsEitherNeither =
  electionWithMsEitherNeitherDefinition.election

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
