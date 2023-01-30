import { Admin } from '@votingworks/api';
import {
  Candidate,
  ContestId,
  ContestOptionId,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  ExternalTally,
  PartyId,
  writeInCandidate,
} from '@votingworks/types';
import { assert, collections, groupBy } from '@votingworks/basics';

export type CountsByContestAndCandidateName = Map<
  ContestId,
  Map<string, number>
>;

export function getScreenAdjudicatedWriteInCounts(
  writeInSummaryData: Admin.WriteInSummaryEntryAdjudicated[],
  onlyOfficialCandidates = false
): CountsByContestAndCandidateName {
  const writeInsByContestAndCandidate = collections.map(
    groupBy(writeInSummaryData, ({ contestId }) => contestId),
    (writeInSummary) => {
      return onlyOfficialCandidates
        ? groupBy(
            [...writeInSummary].filter(
              (s) => s.writeInAdjudication.adjudicatedOptionId !== undefined
            ),
            (s) => s.writeInAdjudication.adjudicatedOptionId as ContestOptionId
          )
        : groupBy(
            [...writeInSummary].filter(
              (s) => s.writeInAdjudication.adjudicatedOptionId === undefined
            ),
            (s) => s.writeInAdjudication.adjudicatedValue
          );
    }
  );
  return collections.map(writeInsByContestAndCandidate, (byCandidate) =>
    collections.map(byCandidate, (entries) =>
      collections.reduce(
        entries,
        (sum, entry) => sum + entry.writeInCount ?? 0,
        0
      )
    )
  );
}

export function filterWriteInCountsByParty(
  counts: CountsByContestAndCandidateName,
  election: Election,
  partyId?: PartyId
): CountsByContestAndCandidateName {
  if (!partyId) return counts;

  const filteredCounts = new Map<ContestId, Map<string, number>>();
  for (const [contestId, contestCounts] of counts) {
    const contest = election.contests.find((c) => c.id === contestId);
    if (contest && contest.partyId === partyId) {
      filteredCounts.set(contestId, contestCounts);
    }
  }
  return filteredCounts;
}

// ExternalTally write-in candidate id creation
export function getAdjudicatedWriteInCandidateId(
  name: string,
  manual: boolean
): string {
  return `write-in-(${name})${manual ? '-manual' : ''}`;
}

export function getAdjudicatedWriteInCandidate(
  name: string,
  manual: boolean
): Candidate {
  return {
    id: getAdjudicatedWriteInCandidateId(name, manual),
    name,
    isWriteIn: true,
  };
}

export function isManuallyAdjudicatedWriteInCandidate(
  candidate: Candidate
): boolean {
  return (
    candidate.id.startsWith('write-in-(') && candidate.id.endsWith(')-manual')
  );
}

// Extracts all write-in data from an ExternalTally and formats it
// as CountsByContestAndCandidateName for the write-in report
export function getManualWriteInCounts(
  manualTally: ExternalTally
): CountsByContestAndCandidateName {
  const allContestCounts = new Map<ContestId, Map<string, number>>();
  for (const [contestId, contestTally] of Object.entries(
    manualTally.contestTallies
  )) {
    if (contestTally?.contest.type === 'candidate') {
      const candidateCountsForContest = new Map<string, number>();
      for (const contestOptionTally of Object.values(contestTally.tallies)) {
        const candidate = contestOptionTally?.option as Candidate;
        const voteCount = contestOptionTally?.tally;
        if (candidate.isWriteIn && voteCount && voteCount > 0) {
          candidateCountsForContest.set(candidate.name, voteCount);
        }
      }
      if (candidateCountsForContest.size > 0) {
        allContestCounts.set(contestId, candidateCountsForContest);
      }
    }
  }
  return allContestCounts;
}

export function combineWriteInCounts(
  writeInCounts: CountsByContestAndCandidateName[]
): CountsByContestAndCandidateName {
  const combinedCounts = new Map<ContestId, Map<string, number>>();

  const combinedContestIds = new Set<ContestId>();
  for (const writeInCount of writeInCounts) {
    for (const contestId of writeInCount.keys()) {
      combinedContestIds.add(contestId);
    }
  }

  for (const contestId of combinedContestIds) {
    const combinedCandidateCountsForContest = new Map<string, number>();
    for (const writeInCount of writeInCounts) {
      const candidateCountForContest = writeInCount.get(contestId);
      if (candidateCountForContest) {
        for (const [name, count] of candidateCountForContest) {
          combinedCandidateCountsForContest.set(
            name,
            (combinedCandidateCountsForContest.get(name) ?? 0) + count
          );
        }
      }
    }

    combinedCounts.set(contestId, combinedCandidateCountsForContest);
  }

  return combinedCounts;
}

export function writeInCountsAreEmpty(
  counts: CountsByContestAndCandidateName
): boolean {
  if (counts.size === 0) return true;

  for (const candidateCounts of counts.values()) {
    if (candidateCounts.size > 0) return false;
  }

  return true;
}

// Merges all the distinct write-in candidate tallies in an ExternalTally
// into a single "Write-In" umbrella tally for the main tally reports
export function mergeWriteIns(externalTally: ExternalTally): ExternalTally {
  const newContestTallies: Dictionary<ContestTally> = {};
  for (const contestTally of Object.values(externalTally.contestTallies)) {
    assert(contestTally);
    let newContestOptionTallies: Dictionary<ContestOptionTally> = {};
    if (contestTally.contest.type === 'candidate') {
      let writeInTally = 0;
      for (const contestOptionTally of Object.values(contestTally.tallies)) {
        assert(contestOptionTally);
        const candidate = contestOptionTally.option as Candidate;
        if (candidate.isWriteIn) {
          writeInTally += contestOptionTally.tally;
        } else {
          newContestOptionTallies[candidate.id] = contestOptionTally;
        }
      }
      newContestOptionTallies[writeInCandidate.id] = {
        option: writeInCandidate,
        tally: writeInTally,
      };
    } else {
      newContestOptionTallies = contestTally.tallies;
    }
    newContestTallies[contestTally.contest.id] = {
      ...contestTally,
      tallies: newContestOptionTallies,
    };
  }

  return {
    ...externalTally,
    contestTallies: newContestTallies,
  };
}
