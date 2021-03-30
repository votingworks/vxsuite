import { join } from 'path'
import { loadElectionDefinition } from '@votingworks/fixtures'
import { Fixture } from '../../fixtures'

export const blankPage1 = new Fixture(join(__dirname, 'blank-p1.jpg'))
export const blankPage2 = new Fixture(join(__dirname, 'blank-p2.jpg'))
export const blankPage3 = new Fixture(join(__dirname, 'blank-p3.jpg'))
export const blankPage4 = new Fixture(join(__dirname, 'blank-p4.jpg'))
export const blankPage5 = new Fixture(join(__dirname, 'blank-p5.jpg'))
export const filledInPage1 = new Fixture(join(__dirname, 'filled-in-p1.jpg'))
export const filledInPage2 = new Fixture(join(__dirname, 'filled-in-p2.jpg'))
export const filledInPage3 = new Fixture(join(__dirname, 'filled-in-p3.jpg'))
export const filledInPage4 = new Fixture(join(__dirname, 'filled-in-p4.jpg'))
export const filledInPage5 = new Fixture(join(__dirname, 'filled-in-p5.jpg'))
export const filledInPage5YesNoOvervote = new Fixture(
  join(__dirname, 'filled-in-p5-yesno-overvote.jpg')
)
export const electionDefinition = loadElectionDefinition(
  join(__dirname, './election.json')
)
export const { election } = electionDefinition
