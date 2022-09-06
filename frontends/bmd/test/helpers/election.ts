import {
  CandidateContest,
  getBallotStyle,
  getContests,
  MsEitherNeitherContest,
  YesNoContest,
} from '@votingworks/types';
import {
  assert,
  singlePrecinctSelectionFor,
  Storage,
} from '@votingworks/utils';
import { electionStorageKey, State, stateStorageKey } from '../../src/app_root';
import { electionSampleDefinition } from '../../src/data';

export const electionDefinition = electionSampleDefinition;
export const { election } = electionDefinition;

export const contest0 = election.contests[0] as CandidateContest;
export const contest1 = election.contests[1] as CandidateContest;
export const contest0candidate0 = contest0.candidates[0];
export const contest0candidate1 = contest0.candidates[1];
export const contest1candidate0 = contest1.candidates[0];

export const defaultPrecinctId = election.precincts[0].id;
export const defaultBallotStyleId = election.ballotStyles[0].id;

export const altPrecinctId = election.precincts[1].id;
export const altBallotStyleId = election.ballotStyles[1].id;

export const presidentContest = election.contests.find(
  (c) =>
    c.type === 'candidate' &&
    c.title === 'President and Vice-President' &&
    c.seats === 1
) as CandidateContest;

export const countyCommissionersContest = election.contests.find(
  (c) =>
    c.type === 'candidate' &&
    c.title === 'County Commissioners' &&
    c.seats === 4
) as CandidateContest;

export const measure102Contest = election.contests.find(
  (c) =>
    c.title === 'Measure 102: Vehicle Abatement Program' && c.type === 'yesno'
) as YesNoContest;

export const measure420Contest = election.contests.find(
  (c) => c.title === 'Measure 420A/420B: Medical Marijuana Initiative'
) as MsEitherNeitherContest;

export const singleSeatContestWithWriteIn = election.contests.find(
  (c) => c.type === 'candidate' && c.allowWriteIns && c.seats === 1
) as CandidateContest;

const ballotStyle = getBallotStyle({
  ballotStyleId: election.ballotStyles[0].id,
  election,
});
assert(ballotStyle);
export const voterContests = getContests({
  ballotStyle,
  election,
});

export async function setElectionInStorage(
  storage: Storage,
  newElectionDefinition = electionDefinition
): Promise<void> {
  await storage.set(electionStorageKey, newElectionDefinition);
}

export async function setStateInStorage(
  storage: Storage,
  state: Partial<State> = {}
): Promise<void> {
  const storedState: Partial<State> = {
    appPrecinct: singlePrecinctSelectionFor(defaultPrecinctId),
    ballotsPrintedCount: 0,
    isLiveMode: true,
    isPollsOpen: true,
    ...state,
  };
  await storage.set(stateStorageKey, storedState);
}
