import {
  BallotStyleId,
  ContestTally,
  ContestTallyMeta,
  Dictionary,
  Election,
  Id,
  ManualTally,
  PartyId,
  Tabulation,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import { Optional, assert } from '@votingworks/basics';
import {
  combineManualElectionResults,
  getEmptyManualTally,
} from '@votingworks/utils';
import { Store } from '../store';
import { ServerFullElectionManualTally } from '../types';

/**
 * Takes manual results in the new data format {@link Tabulation.ManualElectionResult}
 * and converts it to the old format {@link ManualTally}.
 */
export function convertResultsToDeprecatedTally(
  election: Election,
  manualResults: Tabulation.ManualElectionResults
): ManualTally {
  const contestTallies: ManualTally['contestTallies'] = {};

  for (const contest of election.contests) {
    const contestResults = manualResults.contestResults[contest.id];
    assert(contestResults);

    const metadata: ContestTallyMeta = {
      overvotes: contestResults.overvotes,
      undervotes: contestResults.undervotes,
      ballots: contestResults.ballots,
    };

    const tallies: ContestTally['tallies'] = {};
    if (contestResults.contestType === 'yesno') {
      tallies['yes'] = {
        option: ['yes'],
        tally: contestResults.yesTally,
      };
      tallies['no'] = {
        option: ['no'],
        tally: contestResults.noTally,
      };
    } else {
      assert(contest.type === 'candidate');
      for (const candidateTally of Object.values(contestResults.tallies)) {
        const { tally, ...candidate } = candidateTally;
        tallies[candidateTally.id] = {
          option:
            contest.candidates.find((c) => c.id === candidateTally.id) ??
            candidate,
          tally,
        };
      }
    }

    contestTallies[contest.id] = {
      contest,
      metadata,
      tallies,
    };
  }

  return {
    numberOfBallotsCounted: manualResults.ballotCount,
    contestTallies,
  };
}

/**
 * The frontend currently consumes manual tally data as a
 * {@link FullElectionManualTally}, although that will soon change. For now, this
 * method gathers data from the store and constructs the `FullElectionTally`.
 */
export function buildFullElectionManualTallyFromStore(
  store: Store,
  electionId: Id
): Optional<ServerFullElectionManualTally> {
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition } = electionRecord;
  const { election } = electionDefinition;

  // TODO: wire up frontend so it can handle multiple ballot types. for now
  // we are only providing precinct manual tallies to frontend tallying
  const manualResultsRecords = store.getManualResults({
    electionId,
    ballotType: 'precinct',
  });
  if (manualResultsRecords.length === 0) return undefined;

  // calculate manual tallies for each precinct
  const manualTalliesByPrecinct: Dictionary<ManualTally> = {};
  for (const precinct of election.precincts) {
    const precinctManualResults = manualResultsRecords
      .filter(({ precinctId }) => precinctId === precinct.id)
      .map(({ manualResults }) => manualResults);
    manualTalliesByPrecinct[precinct.id] =
      precinctManualResults.length === 0
        ? getEmptyManualTally(election)
        : convertResultsToDeprecatedTally(
            election,
            combineManualElectionResults({
              election,
              allManualResults: precinctManualResults,
            })
          );
  }

  const ballotStyleIdsByPartyId: Record<PartyId, BallotStyleId[]> = {};
  for (const ballotStyle of election.ballotStyles) {
    if (ballotStyle.partyId) {
      ballotStyleIdsByPartyId[ballotStyle.partyId] = [
        ...(ballotStyleIdsByPartyId[ballotStyle.partyId] ?? []),
        ballotStyle.id,
      ];
    }
  }

  const manualTalliesByParty: Dictionary<ManualTally> = {};
  for (const [partyId, ballotStyleIds] of Object.entries(
    ballotStyleIdsByPartyId
  )) {
    const partyManualResults = manualResultsRecords
      .filter(({ ballotStyleId }) => ballotStyleIds.includes(ballotStyleId))
      .map(({ manualResults }) => manualResults);
    manualTalliesByParty[partyId] = convertResultsToDeprecatedTally(
      election,
      combineManualElectionResults({
        election,
        allManualResults: partyManualResults,
      })
    );
  }

  const overallTally = convertResultsToDeprecatedTally(
    election,
    combineManualElectionResults({
      election,
      allManualResults: manualResultsRecords.map(
        ({ manualResults }) => manualResults
      ),
    })
  );

  let oldestCreatedAt = new Date();
  for (const { createdAt } of manualResultsRecords) {
    const createdAtDate = new Date(createdAt);
    if (createdAtDate < oldestCreatedAt) oldestCreatedAt = createdAtDate;
  }

  return {
    votingMethod: VotingMethod.Precinct,
    timestampCreated: oldestCreatedAt,
    overallTally,
    resultsByCategory: {
      [TallyCategory.Precinct]: manualTalliesByPrecinct,
      [TallyCategory.Party]: manualTalliesByParty,
    },
  };
}

/**
 * The manual results entry form allows creating new write-in candidates. These
 * are included in the manual results from the frontend prefaced by
 * `temp-write-in-`. This method creates the new write-in candidates in the
 * database, substitutes the ids in the passed `ManualElectionResults`, and strips out
 * any write-in references with zero votes. Edits the `ManualElectionResults` in place.
 */
export function handleEnteredWriteInCandidateData({
  manualResults,
  electionId,
  store,
}: {
  manualResults: Tabulation.ManualElectionResults;
  electionId: Id;
  store: Store;
}): Tabulation.ManualElectionResults {
  for (const contestResults of Object.values(manualResults.contestResults)) {
    if (contestResults.contestType === 'candidate') {
      for (const [candidateId, candidateTally] of Object.entries(
        contestResults.tallies
      )) {
        if (candidateTally.isWriteIn) {
          if (candidateTally.tally === 0) {
            // if any write-in candidate has no votes, remove them from tally
            delete contestResults.tallies[candidateId];
          } else if (candidateId.startsWith('temp-write-in-')) {
            // for temp-write-in candidates, create records and substitute ids
            const writeInCandidateRecord = store.addWriteInCandidate({
              electionId,
              contestId: contestResults.contestId,
              name: candidateTally.name,
            });
            contestResults.tallies[writeInCandidateRecord.id] = {
              // eslint-disable-next-line vx/gts-spread-like-types
              ...candidateTally,
              id: writeInCandidateRecord.id,
            };
            delete contestResults.tallies[candidateId];
          }
        }
      }
    }
  }

  return manualResults;
}
