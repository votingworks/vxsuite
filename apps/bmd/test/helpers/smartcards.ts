import { act } from '@testing-library/react'
import * as GLOBALS from '../../src/config/globals'
import {
  CandidateContest,
  CardAPI,
  CardPresentAPI,
  Election,
} from '../../src/config/types'
import electionSample from '../../src/data/electionSample.json'
import utcTimestamp from '../../src/utils/utcTimestamp'

const election = electionSample as Election
const contest0 = electionSample.contests[0] as CandidateContest
const contest1 = electionSample.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest1candidate0 = contest1.candidates[0]
const sampleVotes = {
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

const getNewVoterShortValue = () => ({
  t: 'voter',
  c: utcTimestamp(),
  pr: election.precincts[0].id,
  bs: election.ballotStyles[0].id,
})

export const getNewVoterCard = (): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify(getNewVoterShortValue()),
})

export const getAlternateNewVoterCard = (): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify({
    ...getNewVoterShortValue(),
    pr: election.precincts[1].id,
    bs: election.ballotStyles[1].id,
  }),
})

export const getVoidedVoterCard = (): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify({
    ...getNewVoterShortValue(),
    uz: utcTimestamp(),
  }),
})

export const getExpiredVoterCard = (): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify({
    ...getNewVoterShortValue(),
    c: utcTimestamp() - GLOBALS.CARD_EXPIRATION_SECONDS,
  }),
})

export const getExpiredVoterCardWithVotes = (): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify({
    ...getNewVoterShortValue(),
    c: utcTimestamp() - GLOBALS.CARD_EXPIRATION_SECONDS,
    v: sampleVotes,
    u: utcTimestamp(),
  }),
})

export const getVoterCardWithVotes = (): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify({
    ...getNewVoterShortValue(),
    v: sampleVotes,
    u: utcTimestamp(),
  }),
})

export const getUsedVoterCard = (): CardPresentAPI => ({
  present: true,
  shortValue: JSON.stringify({
    ...getNewVoterShortValue(),
    bp: utcTimestamp(),
  }),
})

export const advanceTimers = (ms: number = 0) => {
  act(() => {
    jest.advanceTimersByTime(ms + GLOBALS.CARD_POLLING_INTERVAL)
  })
}
