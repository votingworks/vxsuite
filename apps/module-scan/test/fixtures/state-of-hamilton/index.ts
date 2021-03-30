import { join } from 'path'
import { loadElectionDefinition } from '@votingworks/fixtures'

export const electionDefinition = loadElectionDefinition(
  join(__dirname, './election.json')
)
export const { election } = electionDefinition
export const ballotPdf = join(__dirname, 'ballot.pdf')
export const filledInPage1 = join(__dirname, 'filled-in-dual-language-p1.jpg')
export const filledInPage2 = join(__dirname, 'filled-in-dual-language-p2.jpg')
export const filledInPage3 = join(__dirname, 'filled-in-dual-language-p3.jpg')
export const filledInPage4 = join(__dirname, 'filled-in-dual-language-p4.jpg')
export const filledInPage5 = join(__dirname, 'filled-in-dual-language-p5.jpg')
export const filledInPage5YesNoOvervotes = join(
  __dirname,
  'filled-in-dual-language-p5-yesno-overvotes.jpg'
)
