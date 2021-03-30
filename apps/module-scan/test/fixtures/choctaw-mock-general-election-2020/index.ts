import { readFileSync } from 'fs-extra'
import { join } from 'path'
import { BallotPackageManifest } from '../../../src/types'
import { loadElectionDefinition } from '@votingworks/fixtures'

export const electionDefinition = loadElectionDefinition(
  join(__dirname, './election.json')
)
export const { election } = electionDefinition
export const root = __dirname
export const manifest: BallotPackageManifest = JSON.parse(
  readFileSync(join(__dirname, 'manifest.json'), 'utf8')
)
export const ballotPdf = join(__dirname, 'ballot.pdf')
export const filledInPage1 = join(__dirname, 'filled-in-p1.png')
export const filledInPage2 = join(__dirname, 'filled-in-p2.png')
