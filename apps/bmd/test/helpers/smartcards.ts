import { act, waitFor } from '@testing-library/react'
import { electionSample as election } from '@votingworks/fixtures'
import {
  CandidateContest,
  vote,
  getContests,
  VotesDict,
} from '@votingworks/types'
import * as GLOBALS from '../../src/config/globals'
import { VoterCardData } from '../../src/config/types'
import utcTimestamp from '../../src/utils/utcTimestamp'

const contest0 = election.contests[0] as CandidateContest
const contest1 = election.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest1candidate0 = contest1.candidates[0]
const altBallotStyleId = election.ballotStyles[1].id
const altPrecinctId = election.precincts[1].id

export const sampleVotes0: Readonly<VotesDict> = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election,
  }),
  {
    president: [contest0candidate0],
    'question-a': ['no'],
    'question-b': ['yes'],
    senator: [contest1candidate0],
  }
)

export const sampleVotes1: Readonly<VotesDict> = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election,
  }),
  {
    '102': ['yes'],
    president: 'barchi-hallaren',
    senator: 'weiford',
    'representative-district-6': 'plunkard',
    governor: 'franz',
    'lieutenant-governor': 'norberg',
    'secretary-of-state': 'shamsi',
    'state-senator-district-31': 'shiplett',
    'state-assembly-district-54': 'solis',
    'county-commissioners': ['argent'],
    'county-registrar-of-wills': 'ramachandrani',
    'city-mayor': 'white',
    'city-council': ['eagle'],
    'judicial-robert-demergue': ['yes'],
    'judicial-elmer-hull': ['yes'],
    'question-a': ['yes'],
    'question-b': ['yes'],
    'question-c': ['yes'],
    'proposition-1': ['yes'],
    'measure-101': ['yes'],
  }
)

export const sampleVotes2: Readonly<VotesDict> = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election,
  }),
  {
    '102': ['no'],
    president: 'cramer-vuocolo',
    senator: 'garriss',
    'representative-district-6': 'reeder',
    governor: 'harris',
    'lieutenant-governor': 'parks',
    'secretary-of-state': 'talarico',
    'state-senator-district-31': 'shiplett',
    'state-assembly-district-54': 'keller',
    'county-commissioners': ['witherspoonsmithson'],
    'county-registrar-of-wills': [
      { id: 'write-in__HOT DOG', name: 'HOT DOG', isWriteIn: true },
    ],
    'city-mayor': 'seldon',
    'city-council': ['rupp'],
    'judicial-robert-demergue': ['no'],
    'judicial-elmer-hull': ['no'],
    'question-a': ['no'],
    'question-b': ['no'],
    'question-c': ['no'],
    'proposition-1': ['no'],
    'measure-101': ['no'],
  }
)

export const sampleVotes3: Readonly<VotesDict> = vote(
  getContests({
    ballotStyle: election.ballotStyles[0],
    election,
  }),
  {
    '102': ['yes'],
    president: 'court-blumhardt',
    senator: 'wentworthfarthington',
    'representative-district-6': 'schott',
    governor: 'bargmann',
    'lieutenant-governor': 'garcia',
    'secretary-of-state': 'shamsi',
    'state-senator-district-31': 'shiplett',
    'state-assembly-district-54': 'rangel',
    'county-commissioners': ['bainbridge'],
    'county-registrar-of-wills': [
      { id: 'write-in__HOT DOG', name: 'HOT DOG', isWriteIn: true },
    ],
    'city-mayor': 'white',
    'city-council': ['shry'],
    'judicial-robert-demergue': ['yes'],
    'judicial-elmer-hull': ['yes'],
    'question-a': ['yes'],
    'question-b': ['yes'],
    'question-c': ['yes'],
    'proposition-1': ['yes'],
    'measure-101': ['yes'],
  }
)

export const adminCardForElection = (electionHash: string): string =>
  JSON.stringify({
    t: 'admin',
    h: electionHash,
  })

export const pollWorkerCardForElection = (electionHash: string): string =>
  JSON.stringify({
    t: 'pollworker',
    h: electionHash,
  })

export const createVoterCard = (
  cardData: Partial<VoterCardData> = {}
): string => {
  return JSON.stringify({
    t: 'voter',
    c: utcTimestamp(),
    pr: election.precincts[0].id,
    bs: election.ballotStyles[0].id,
    ...cardData,
  })
}

export const getNewVoterCard = (): string => createVoterCard()

export const getAlternateNewVoterCard = (): string =>
  createVoterCard({
    pr: altPrecinctId,
    bs: altBallotStyleId,
  })

export const getOtherElectionVoterCard = (): string =>
  createVoterCard({
    pr: '999999999',
    bs: '999999999',
  })

export const getVoidedVoterCard = (): string =>
  createVoterCard({
    uz: utcTimestamp(),
  })

export const getExpiredVoterCard = (): string =>
  createVoterCard({
    c: utcTimestamp() - GLOBALS.CARD_EXPIRATION_SECONDS,
  })

export const getUsedVoterCard = (): string =>
  createVoterCard({
    bp: utcTimestamp(),
  })

export const advanceTimers = (seconds = 0): void => {
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

export const advanceTimersAndPromises = async (seconds = 0): Promise<void> => {
  advanceTimers(seconds)
  await waitFor(() => {
    // Wait for promises.
  })
}
