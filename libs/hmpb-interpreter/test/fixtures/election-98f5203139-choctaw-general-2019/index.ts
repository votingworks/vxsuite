import { join } from 'path'
import { Fixture } from '../../fixtures'
import { loadElectionDefinition } from '@votingworks/fixtures'

export const blankPage1 = new Fixture(join(__dirname, 'blank-p1.jpg'))
export const blankPage2 = new Fixture(join(__dirname, 'blank-p2.jpg'))
export const blankPage3 = new Fixture(join(__dirname, 'blank-p3.jpg'))
export const filledInPage1 = new Fixture(join(__dirname, 'filled-in-p1.jpg'))
export const filledInPage2 = new Fixture(join(__dirname, 'filled-in-p2.jpg'))
export const borderPage1 = new Fixture(join(__dirname, 'border-p1.jpg'))
export const borderPage3 = new Fixture(join(__dirname, 'border-p3.jpg'))
export const electionDefinition = loadElectionDefinition(
  join(__dirname, './election.json')
)
export const { election } = electionDefinition
