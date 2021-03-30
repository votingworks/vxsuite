import { join } from 'path'
import { loadElectionDefinition } from '@votingworks/fixtures'

export const electionSampleDefinition = loadElectionDefinition(
  join(__dirname, './electionSample.json')
)
export const electionSampleNoSealDefinition = loadElectionDefinition(
  join(__dirname, './electionSampleNoSeal.json')
)
export const electionSampleWithSealDefinition = loadElectionDefinition(
  join(__dirname, './electionSampleWithSeal.json')
)
export const electionPrimarySampleDefinition = loadElectionDefinition(
  join(__dirname, './electionPrimarySample.json')
)
