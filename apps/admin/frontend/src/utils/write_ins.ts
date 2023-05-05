import {
  Candidate,
  ContestId,
  ContestOptionTally,
  ContestTally,
  Dictionary,
  Election,
  ManualTally,
  PartyId,
  writeInCandidate,
} from '@votingworks/types';
import { assert, collections, iter } from '@votingworks/basics';
import type {
  WriteInSummaryEntryAdjudicated,
  WriteInSummaryEntryAdjudicatedOfficialCandidate,
  WriteInSummaryEntryAdjudicatedWriteInCandidate,
} from '@votingworks/admin-backend';

export type CountsByContestAndCandidateName = Map<
  ContestId,
  Map<string, number>
>;

/**
 * Returns the counts, by contest id and candidate id, of write-ins adjudicated
 * for official candidates.
 */
export function getOfficialCandidateScreenAdjudicatedWriteInCounts(
  writeInSummaryData: WriteInSummaryEntryAdjudicated[]
): CountsByContestAndCandidateName {
  const writeInsByContestAndCandidate = collections.map(
    iter(writeInSummaryData).toMap(({ contestId }) => contestId),
    (writeInSummary) => {
      return iter(writeInSummary)
        .filter(
          (s): s is WriteInSummaryEntryAdjudicatedOfficialCandidate =>
            s.adjudicationType === 'official-candidate'
        )
        .toMap((s) => s.candidateId);
    }
  );
  return collections.map(writeInsByContestAndCandidate, (byCandidate) =>
    collections.map(byCandidate, (entries) =>
      iter(entries).sum((entry) => entry.writeInCount ?? 0)
    )
  );
}

/**
 * Returns the counts, by contest id and candidate name, of write-ins adjudicated
 * for write-in candidates.
 */
export function getWriteInCandidateScreenAdjudicatedWriteInCounts(
  writeInSummaryData: WriteInSummaryEntryAdjudicated[]
): CountsByContestAndCandidateName {
  const writeInsByContestAndCandidate = collections.map(
    iter(writeInSummaryData).toMap(({ contestId }) => contestId),
    (writeInSummary) => {
      return iter(writeInSummary)
        .filter(
          (s): s is WriteInSummaryEntryAdjudicatedWriteInCandidate =>
            s.adjudicationType === 'write-in-candidate'
        )
        .toMap((s) => s.candidateName);
    }
  );
  return collections.map(writeInsByContestAndCandidate, (byCandidate) =>
    collections.map(byCandidate, (entries) =>
      iter(entries).sum((entry) => entry.writeInCount ?? 0)
    )
  );
}

/**
 * Returns the counts, by contest id and candidate id, of write-ins adjudicated
 * for official candidates.
 */
export function getInvalidWriteInCounts(
  writeInSummaryData: WriteInSummaryEntryAdjudicated[]
): Map<ContestId, number> {
  return collections.map(
    iter(writeInSummaryData).toMap(({ contestId }) => contestId),
    (writeInSummaries) => {
      return collections.reduce(
        writeInSummaries,
        (acc, writeInSummary) => {
          return writeInSummary.adjudicationType === 'invalid'
            ? acc + writeInSummary.writeInCount
            : acc;
        },
        0
      );
    }
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
    if (
      contest &&
      contest.type === 'candidate' &&
      contest.partyId === partyId
    ) {
      filteredCounts.set(contestId, contestCounts);
    }
  }
  return filteredCounts;
}

// ManualTally write-in candidate id creation
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

// Extracts all write-in data from an ManualTally and formats it
// as CountsByContestAndCandidateName for the write-in report
export function getManualWriteInCounts(
  manualTally: ManualTally
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

// Merges all the distinct write-in candidate tallies in an ManualTally
// into a single "Write-In" umbrella tally for the main tally reports
export function mergeWriteIns(manualTally: ManualTally): ManualTally {
  const newContestTallies: Dictionary<ContestTally> = {};
  for (const contestTally of Object.values(manualTally.contestTallies)) {
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
    ...manualTally,
    contestTallies: newContestTallies,
  };
}
