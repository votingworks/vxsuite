import { join } from 'path'
import { loadElectionDefinition } from '@votingworks/fixtures'

export const electionDefinition = loadElectionDefinition(
  join(__dirname, './election.json')
)
export const { election } = electionDefinition
export const ballotPdf = join(__dirname, 'ballot.pdf')
export const ballot6522Pdf = join(__dirname, 'ballot-6522.pdf')
export const blankPage1 = join(__dirname, 'blank-p1.png')
export const blankPage2 = join(__dirname, 'blank-p2.png')
export const hardQRCodePage1 = join(__dirname, 'hard-qr-code-p1.png')
export const hardQRCodePage2 = join(__dirname, 'hard-qr-code-p2.png')
