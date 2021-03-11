import { Election, ElectionDefinition } from '@votingworks/types'
import { sha256 } from 'js-sha256'
import * as path from 'path'

import electionSampleUntyped from './data/electionSample.json'
import electionSample2Untyped from './data/electionSample2/election.json'
import primaryElectionSampleUntyped from './data/electionPrimary/electionPrimarySample.json'
import multiPartyPrimaryElectionUntyped from './data/electionMultiPartyPrimary/electionMultiPartyPrimarySample.json'
import electionSampleLongContentUntyped from './data/electionSampleLongContent.json'
import electionWithMsEitherNeitherUntyped from './data/electionWithMsEitherNeither/electionWithMsEitherNeither.json'

const dataPath = path.join(__dirname, '/data')

export function asElectionDefinition(election: Election): ElectionDefinition {
  return {
    election,
    electionHash: sha256(JSON.stringify(election)),
  }
}

export const electionSample = (electionSampleUntyped as unknown) as Election
export const electionSample2 = (electionSample2Untyped as unknown) as Election
export const primaryElectionSample = (primaryElectionSampleUntyped as unknown) as Election
export const multiPartyPrimaryElection = (multiPartyPrimaryElectionUntyped as unknown) as Election
export const electionSampleLongContent = (electionSampleLongContentUntyped as unknown) as Election
export const electionWithMsEitherNeither = (electionWithMsEitherNeitherUntyped as unknown) as Election

export const electionSampleDefinition = asElectionDefinition(electionSample)
export const primaryElectionSampleDefinition = asElectionDefinition(
  primaryElectionSample
)
export const electionSample2Definition = asElectionDefinition(electionSample2)
export const multiPartyPrimaryElectionDefinition = asElectionDefinition(
  multiPartyPrimaryElection
)
export const electionSampleLongContentDefinition = asElectionDefinition(
  electionSampleLongContent
)
export const electionWithMsEitherNeitherDefinition = asElectionDefinition(
  electionWithMsEitherNeither
)

export const electionMultiPartyPrimaryInternal = {
  electionDefinition: multiPartyPrimaryElectionDefinition,
  cvrDataFolderPath: path.join(dataPath, '/electionMultiPartyPrimary/cvrFiles'),
  semsDataFolderPath: path.join(
    dataPath,
    '/electionMultiPartyPrimary/semsFiles'
  ),
}

export const electionSimplePrimaryInternal = {
  electionDefinition: primaryElectionSampleDefinition,
  cvrDataFolderPath: path.join(dataPath, '/electionPrimary/cvrFiles'),
}

export const electionSample2Internal = {
  electionDefinition: electionSample2Definition,
  cvrDataFolderPath: path.join(dataPath, '/electionSample2/cvrFiles'),
}

export const electionWithMsEitherNeitherInternal = {
  electionDefinition: electionWithMsEitherNeitherDefinition,
  cvrDataFolderPath: path.join(
    dataPath,
    '/electionWithMsEitherNeither/cvrFiles'
  ),
  semsDataFolderPath: path.join(
    dataPath,
    '/electionWithMsEitherNeither/semsFiles'
  ),
}
