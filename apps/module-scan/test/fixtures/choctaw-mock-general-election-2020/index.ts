import { parseElection } from '@votingworks/types'
import { BallotPackageManifest } from '@votingworks/utils'
import { readFileSync } from 'fs-extra'
import { join } from 'path'
import electionJSON from './election.json'

export const election = parseElection(electionJSON)
export const root = __dirname
export const manifest: BallotPackageManifest = JSON.parse(
  readFileSync(join(__dirname, 'manifest.json'), 'utf8')
)
export const ballotPdf = join(__dirname, 'ballot.pdf')
export const filledInPage1 = join(__dirname, 'filled-in-p1.png')
export const filledInPage2 = join(__dirname, 'filled-in-p2.png')
