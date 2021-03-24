import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types'
import { readFileSync } from 'fs'
import { join } from 'path'

function electionDefinitionFromFile(
  path: string
): ElectionDefinition & { electionData: string } {
  const electionData = readFileSync(path, 'utf-8')
  return {
    ...safeParseElectionDefinition(electionData).unwrap(),
    electionData,
  }
}

export const electionSampleDefinition = electionDefinitionFromFile(
  join(__dirname, 'electionSample.json')
)
export const electionSampleNoSealDefinition = electionDefinitionFromFile(
  join(__dirname, 'electionSampleNoSeal.json')
)
export const electionSampleWithSealDefinition = electionDefinitionFromFile(
  join(__dirname, 'electionSampleWithSeal.json')
)
export const electionPrimarySampleDefinition = electionDefinitionFromFile(
  join(__dirname, 'electionPrimarySample.json')
)
