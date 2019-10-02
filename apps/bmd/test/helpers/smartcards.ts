import { act } from '@testing-library/react'
import {
  CandidateContest,
  CompletedBallot,
  electionSample as election,
  vote,
  getContests,
  VotesDict,
} from '@votingworks/ballot-encoder'
import * as GLOBALS from '../../src/config/globals'
import { CardAPI, CardPresentAPI, VoterCardData } from '../../src/config/types'
import utcTimestamp from '../../src/utils/utcTimestamp'

const contest0 = election.contests[0] as CandidateContest
const contest1 = election.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest1candidate0 = contest1.candidates[0]
const altBallotStyleId = election.ballotStyles[1].id
const altPrecinctId = election.precincts[1].id

export const sampleVotes0: VotesDict = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election: election,
  }),
  {
    president: [contest0candidate0],
    'question-a': 'no',
    'question-b': 'yes',
    senator: [contest1candidate0],
  }
)

export const sampleVotes1: VotesDict = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election: election,
  }),
  {
    '102': 'yes',
    president: [
      {
        id: 'barchi-hallaren',
        name: 'Joseph Barchi and Joseph Hallaren',
        partyId: '0',
      },
    ],
    senator: [{ id: 'weiford', name: 'Dennis Weiford', partyId: '0' }],
    'representative-district-6': [
      { id: 'plunkard', name: 'Brad Plunkard', partyId: '0' },
    ],
    governor: [{ id: 'franz', name: 'Charlene Franz', partyId: '0' }],
    'lieutenant-governor': [
      { id: 'norberg', name: 'Chris Norberg', partyId: '0' },
    ],
    'secretary-of-state': [
      { id: 'shamsi', name: 'Laila Shamsi', partyId: '0' },
    ],
    'state-senator-district-31': [
      { id: 'shiplett', name: 'Edward Shiplett', partyId: '3' },
    ],
    'state-assembly-district-54': [
      { id: 'solis', name: 'Andrea Solis', partyId: '0' },
    ],
    'county-commissioners': [
      { id: 'argent', name: 'Camille Argent', partyId: '0' },
    ],
    'county-registrar-of-wills': [
      { id: 'ramachandrani', name: 'Rhadka Ramachandrani', partyId: '6' },
    ],
    'city-mayor': [{ id: 'white', name: 'Orville White', partyId: '1' }],
    'city-council': [{ id: 'eagle', name: 'Harvey Eagle', partyId: '0' }],
    'judicial-robert-demergue': 'yes',
    'judicial-elmer-hull': 'yes',
    'question-a': 'yes',
    'question-b': 'yes',
    'question-c': 'yes',
    'proposition-1': 'yes',
    'measure-101': 'yes',
  }
)

export const sampleVotes2: VotesDict = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election: election,
  }),
  {
    '102': 'no',
    president: [
      {
        id: 'cramer-vuocolo',
        name: 'Adam Cramer and Greg Vuocolo',
        partyId: '1',
      },
    ],
    senator: [{ id: 'garriss', name: 'Lloyd Garriss', partyId: '1' }],
    'representative-district-6': [
      { id: 'reeder', name: 'Bruce Reeder', partyId: '1' },
    ],
    governor: [{ id: 'harris', name: 'Gerald Harris', partyId: '1' }],
    'lieutenant-governor': [
      { id: 'parks', name: 'Anthony Parks', partyId: '1' },
    ],
    'secretary-of-state': [
      { id: 'talarico', name: 'Marty Talarico', partyId: '1' },
    ],
    'state-senator-district-31': [
      { id: 'shiplett', name: 'Edward Shiplett', partyId: '3' },
    ],
    'state-assembly-district-54': [
      { id: 'keller', name: 'Amos Keller', partyId: '1' },
    ],
    'county-commissioners': [
      {
        id: 'witherspoonsmithson',
        name: 'Chloe Witherspoon-Smithson',
        partyId: '0',
      },
    ],
    'county-registrar-of-wills': [
      { id: 'write-in__HOT DOG', name: 'HOT DOG', isWriteIn: true },
    ],
    'city-mayor': [{ id: 'seldon', name: 'Gregory Seldon', partyId: '2' }],
    'city-council': [{ id: 'rupp', name: 'Randall Rupp', partyId: '0' }],
    'judicial-robert-demergue': 'no',
    'judicial-elmer-hull': 'no',
    'question-a': 'no',
    'question-b': 'no',
    'question-c': 'no',
    'proposition-1': 'no',
    'measure-101': 'no',
  }
)

export const sampleVotes3: VotesDict = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election: election,
  }),
  {
    '102': 'yes',
    president: [
      {
        id: 'court-blumhardt',
        name: 'Daniel Court and Amy Blumhardt',
        partyId: '2',
      },
    ],
    senator: [
      {
        id: 'wentworthfarthington',
        name: 'Sylvia Wentworth-Farthington',
        partyId: '2',
      },
    ],
    'representative-district-6': [
      { id: 'schott', name: 'Brad Schott', partyId: '2' },
    ],
    governor: [{ id: 'bargmann', name: 'Linda Bargmann', partyId: '2' }],
    'lieutenant-governor': [
      { id: 'garcia', name: 'Luis Jorges Garcia', partyId: '2' },
    ],
    'secretary-of-state': [
      { id: 'shamsi', name: 'Laila Shamsi', partyId: '0' },
    ],
    'state-senator-district-31': [
      { id: 'shiplett', name: 'Edward Shiplett', partyId: '3' },
    ],
    'state-assembly-district-54': [
      { id: 'rangel', name: 'Davitra Rangel', partyId: '2' },
    ],
    'county-commissioners': [
      { id: 'bainbridge', name: 'Clayton Bainbridge', partyId: '0' },
    ],
    'county-registrar-of-wills': [
      { id: 'write-in__HOT DOG', name: 'HOT DOG', isWriteIn: true },
    ],
    'city-mayor': [{ id: 'white', name: 'Orville White', partyId: '1' }],
    'city-council': [{ id: 'shry', name: 'Carroll Shry', partyId: '0' }],
    'judicial-robert-demergue': 'yes',
    'judicial-elmer-hull': 'yes',
    'question-a': 'yes',
    'question-b': 'yes',
    'question-c': 'yes',
    'proposition-1': 'yes',
    'measure-101': 'yes',
  }
)

export const sampleBallot: CompletedBallot = {
  ballotId: 'test-ballot-id',
  ballotStyle: election.ballotStyles[0],
  election,
  precinct: election.precincts[0],
  votes: sampleVotes0,
  isTestBallot: true,
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

type CreateVoterCardConfig = Partial<VoterCardData> & {
  longValueExists?: boolean
}

export const createVoterCard = (
  config: CreateVoterCardConfig = {}
): CardPresentAPI => {
  const { longValueExists, ...cardData } = config
  return {
    present: true,
    longValueExists,
    shortValue: JSON.stringify({
      t: 'voter',
      c: utcTimestamp(),
      pr: election.precincts[0].id,
      bs: election.ballotStyles[0].id,
      ...cardData,
    }),
  }
}

export const getNewVoterCard = () => createVoterCard()

export const getAlternateNewVoterCard = () =>
  createVoterCard({
    pr: altPrecinctId,
    bs: altBallotStyleId,
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
    longValueExists: true,
  })

export const getVoterCardWithVotes = () =>
  createVoterCard({
    longValueExists: true,
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
