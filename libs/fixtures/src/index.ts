import { Election, ElectionDefinition } from '@votingworks/types'
import { sha256 } from 'js-sha256'

import electionSampleUntyped from './data/electionSample.json'
import primaryElectionSampleUntyped from './data/electionPrimarySample.json'
import multiPartyPrimaryElectionUntyped from './data/electionMultiPartyPrimarySample.json'
import electionSampleLongContentUntyped from './data/electionSampleLongContent.json'
import electionWithMsEitherNeitherUntyped from './data/electionWithMsEitherNeither.json'

export function asElectionDefinition(election: Election): ElectionDefinition {
  return {
    election,
    electionHash: sha256(JSON.stringify(election)),
  }
}

export const electionSample = (electionSampleUntyped as unknown) as Election
export const primaryElectionSample = (primaryElectionSampleUntyped as unknown) as Election
export const multiPartyPrimaryElection = (multiPartyPrimaryElectionUntyped as unknown) as Election
export const electionSampleLongContent = (electionSampleLongContentUntyped as unknown) as Election
export const electionWithMsEitherNeither = (electionWithMsEitherNeitherUntyped as unknown) as Election

export const electionSampleDefinition = asElectionDefinition(electionSample)
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
