import { act } from '@testing-library/react'
import * as GLOBALS from '../../src/config/globals'
import {
  CandidateContest,
  CardAPI,
  CardPresentAPI,
  Election,
  VoterCardData,
  VotesDict,
} from '../../src/config/types'
import electionSample from '../../src/data/electionSample.json'
import utcTimestamp from '../../src/utils/utcTimestamp'

const election = electionSample as Election
const contest0 = electionSample.contests[0] as CandidateContest
const contest1 = electionSample.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest1candidate0 = contest1.candidates[0]
const sampleVotes: VotesDict = {
  president: [contest0candidate0],
  'question-a': 'no',
  'question-b': 'yes',
  senator: [contest1candidate0],
}

export const noCard: CardAPI = {
  present: false,
}

export const adminCard: CardPresentAPI = {
  present: true,
  longValueExists: true,
  shortValue: JSON.stringify({
    t: 'clerk',
    h: 'abcd',
  }),
}

export const pollWorkerCard: CardPresentAPI = {
  present: true,
  shortValue: JSON.stringify({
    t: 'pollworker',
    h: 'abcd',
  }),
}

export const createVoterCard = (
  config?: Partial<VoterCardData>
): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify({
    t: 'voter',
    c: utcTimestamp(),
    pr: election.precincts[0].id,
    bs: election.ballotStyles[0].id,
    ...config,
  }),
})

export const getNewVoterCard = () => createVoterCard()

export const getAlternateNewVoterCard = () =>
  createVoterCard({
    pr: election.precincts[1].id,
    bs: election.ballotStyles[1].id,
  })

export const getVoidedVoterCard = () =>
  createVoterCard({
    uz: utcTimestamp(),
  })

export const getExpiredVoterCard = () =>
  createVoterCard({
    c: utcTimestamp() - GLOBALS.CARD_EXPIRATION_SECONDS,
  })

export const getExpiredVoterCardWithVotes = () =>
  createVoterCard({
    c: utcTimestamp() - GLOBALS.CARD_EXPIRATION_SECONDS,
    v: sampleVotes,
    u: utcTimestamp(),
  })

export const getVoterCardWithVotes = () =>
  createVoterCard({
    v: sampleVotes,
    u: utcTimestamp(),
  })

export const getUsedVoterCard = () =>
  createVoterCard({
    bp: utcTimestamp(),
  })

export const advanceTimers = (seconds: number = 0) => {
  const maxSeconds = GLOBALS.IDLE_TIMEOUT_SECONDS
  if (seconds > maxSeconds) {
    throw new Error(`Seconds value should not be greater than ${maxSeconds}`)
  }
  act(() => {
    jest.advanceTimersByTime(
      seconds ? seconds * 1000 : GLOBALS.CARD_POLLING_INTERVAL
    )
  })
}
