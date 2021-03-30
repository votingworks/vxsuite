import { join } from 'path'
import { loadElectionDefinition } from '@votingworks/fixtures'

export const electionDefinition = loadElectionDefinition(
  join(__dirname, './election.json')
)
export const { election } = electionDefinition
export const ballotPdf = join(__dirname, 'ballot.pdf')
export const filledInPage1 = join(__dirname, 'filled-in-p1.png')
export const filledInPage2 = join(__dirname, 'filled-in-p2.png')
