import electionSample from '../../src/data/electionSample.json'
import {
  CandidateContest,
  Election,
  YesNoContest,
} from '../../src/config/types'
import { getBallotStyle, getContests } from '../../src/utils/election'

import { electionStorageKey, stateStorageKey } from '../../src/AppRoot'

export const election = electionSample as Election
export const contest0 = election.contests[0] as CandidateContest
export const contest1 = election.contests[1] as CandidateContest
export const contest0candidate0 = contest0.candidates[0]
export const contest0candidate1 = contest0.candidates[1]
export const contest1candidate0 = contest1.candidates[0]

export const presidentContest = electionSample.contests.find(
  c => c.title === 'President and Vice-President' && c.seats === 1
) as CandidateContest

export const countyCommissionersContest = electionSample.contests.find(
  c => c.title === 'County Commissioners' && c.seats === 4
) as CandidateContest

export const measure102Contest = electionSample.contests.find(
  c =>
    c.title === 'Measure 102: Vehicle Abatement Program' && c.type === 'yesno'
) as YesNoContest

export const singleSeatContestWithWriteIn = electionSample.contests.find(
  c => !!c.allowWriteIns && c.seats === 1
) as CandidateContest

export const voterContests = getContests({
  ballotStyle: getBallotStyle({
    ballotStyleId: election.ballotStyles[0].id,
    election,
  }),
  election,
})

export const electionAsString = JSON.stringify(election)

export const setElectionInLocalStorage = () => {
  window.localStorage.setItem(electionStorageKey, electionAsString)
}

export const setStateInLocalStorage = (state = {}) => {
  const defaultLiveState = {
    appMode: {
      name: 'VxMark',
      isVxMark: true,
    },
    ballotsPrintedCount: 0,
    isLiveMode: true,
    isPollsOpen: true,
  }
  window.localStorage.setItem(
    stateStorageKey,
    JSON.stringify({
      ...defaultLiveState,
      ...state,
    })
  )
}

export default {}
