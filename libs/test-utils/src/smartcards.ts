import {
  AdminCardData,
  Election,
  PollworkerCardData,
  VoterCardData,
} from '@votingworks/types'
import { strict as assert } from 'assert'

/**
 * Returns current UTC unix timestamp (epoch) in seconds
 */
const utcTimestamp = (): number => Math.round(Date.now() / 1000)

export const makeAdminCard = (electionHash: string): AdminCardData => ({
  t: 'admin',
  h: electionHash,
})

export const makePollWorkerCard = (
  electionHash: string
): PollworkerCardData => ({
  t: 'pollworker',
  h: electionHash,
})

export const makeInvalidPollWorkerCard = (): PollworkerCardData =>
  makePollWorkerCard(
    'd34db33f' // wrong election
  )

export const makeVoterCard = (
  election: Election,
  cardData: Partial<VoterCardData> = {}
): VoterCardData => {
  const ballotStyle = cardData.bs
    ? election.ballotStyles.find(({ id }) => id === cardData.bs)
    : election.ballotStyles[0]
  assert(ballotStyle, `missing ballot style: ${cardData.bs}`)

  const precinct = election.precincts.find(
    ({ id }) => id === (cardData.pr ?? ballotStyle.precincts[0])
  )
  assert(
    precinct,
    `missing precinct: ${cardData.pr ?? ballotStyle.precincts[0]}`
  )

  return {
    t: 'voter',
    c: utcTimestamp(),
    pr: precinct.id,
    bs: ballotStyle.id,
    ...cardData,
  }
}

export const makeVoidedVoterCard = (election: Election): VoterCardData =>
  makeVoterCard(election, {
    uz: utcTimestamp(),
  })

export const makeUsedVoterCard = (election: Election): VoterCardData =>
  makeVoterCard(election, {
    bp: utcTimestamp(),
  })
