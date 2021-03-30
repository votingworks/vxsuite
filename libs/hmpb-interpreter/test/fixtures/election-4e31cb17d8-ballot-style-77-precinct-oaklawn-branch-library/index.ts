import { join } from 'path'
import { loadElectionDefinition } from '@votingworks/fixtures'
import { Fixture } from '../../fixtures'

export const blankPage1 = new Fixture(join(__dirname, 'blank-p1.jpg'))
export const blankPage2 = new Fixture(join(__dirname, 'blank-p2.jpg'))
export const filledInPage1 = new Fixture(join(__dirname, 'filled-in-p1.jpg'))
export const filledInPage2 = new Fixture(join(__dirname, 'filled-in-p2.jpg'))
export const partialBorderPage2 = new Fixture(
  join(__dirname, 'extra-contest-detected-p2.jpg')
)

export const electionDefinition = loadElectionDefinition(
  join(__dirname, './election.json')
)
export const { election } = electionDefinition
