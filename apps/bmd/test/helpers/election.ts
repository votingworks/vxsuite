import {
  CandidateContest,
  YesNoContest,
  Election,
  MsEitherNeitherContest,
  // electionSample,
} from '@votingworks/ballot-encoder'
import electionSample from '../../src/data/electionSample.json'
import {
  getBallotStyle,
  getContests,
  getZeroTally,
} from '../../src/utils/election'

import {
  electionStorageKey,
  stateStorageKey,
  AppStorage,
  State,
} from '../../src/AppRoot'
import { Storage } from '../../src/utils/Storage'

export const election = electionSample as Election
export const contest0 = election.contests[0] as CandidateContest
export const contest1 = election.contests[1] as CandidateContest
export const contest0candidate0 = contest0.candidates[0]
export const contest0candidate1 = contest0.candidates[1]
export const contest1candidate0 = contest1.candidates[0]

export const defaultPrecinctId = election.precincts[0].id
export const defaultBallotStyleId = election.ballotStyles[0].id

export const altPrecinctId = election.precincts[1].id
export const altBallotStyleId = election.ballotStyles[1].id

export const presidentContest = election.contests.find(
  (c) =>
    c.type === 'candidate' &&
    c.title === 'President and Vice-President' &&
    c.seats === 1
) as CandidateContest

export const countyCommissionersContest = election.contests.find(
  (c) =>
    c.type === 'candidate' &&
    c.title === 'County Commissioners' &&
    c.seats === 4
) as CandidateContest

export const measure102Contest = election.contests.find(
  (c) =>
    c.title === 'Measure 102: Vehicle Abatement Program' && c.type === 'yesno'
) as YesNoContest

export const measure420Contest = election.contests.find(
  (c) => c.title === 'Measure 420A/420B: Medical Marijuana Initiative'
) as MsEitherNeitherContest

export const singleSeatContestWithWriteIn = election.contests.find(
  (c) => c.type === 'candidate' && !!c.allowWriteIns && c.seats === 1
) as CandidateContest

export const voterContests = getContests({
  ballotStyle: getBallotStyle({
    ballotStyleId: election.ballotStyles[0].id,
    election,
  }),
  election,
})

export const setElectionInStorage = (storage: Storage<AppStorage>) => {
  storage.set(electionStorageKey, election)
}

export const setStateInStorage = (
  storage: Storage<AppStorage>,
  state: Partial<State> = {}
) => {
  storage.set(stateStorageKey, {
    appPrecinctId: defaultPrecinctId,
    ballotsPrintedCount: 0,
    isLiveMode: true,
    isPollsOpen: true,
    tally: getZeroTally(election),
    ...state,
  })
}
