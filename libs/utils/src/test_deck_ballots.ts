import { assert, assertDefined, find, iter } from '@votingworks/basics';
import {
  AnyContest,
  WriteInCandidate,
  CandidateContest,
  Candidate,
  Election,
  PartyId,
  PrecinctId,
  getContests,
  VotesDict,
  BallotStyleId,
} from '@votingworks/types';
import { applyStraightPartyRules } from './straight_party';
import { convertVotesDictToTabulationVotes } from './tabulation/convert';

/**
 * The type of ballot in a test deck:
 * - `bubble`: Bubble ballot (hmpb)
 * - `summary`: Summary ballot with QR-encoded votes
 */
export type TestDeckBallotFormat = 'bubble' | 'summary';

export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  ballotFormat: TestDeckBallotFormat;
  votes: VotesDict;
}

export function numBallotPositions(contest: AnyContest): number {
  if (contest.type === 'candidate') {
    return (
      contest.candidates.length + (contest.allowWriteIns ? contest.seats : 0)
    );
  }
  return 2;
}

export function generateTestDeckWriteIn(index: number): WriteInCandidate {
  return {
    id: 'write-in',
    isWriteIn: true,
    name: 'WRITE-IN',
    writeInIndex: index,
  };
}

export function getTestDeckCandidateAtIndex(
  contest: CandidateContest,
  position: number
): Candidate {
  assert(position < numBallotPositions(contest)); // safety check
  if (position < contest.candidates.length) {
    return assertDefined(contest.candidates[position]);
  }
  return generateTestDeckWriteIn(position - contest.candidates.length);
}

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
  ballotFormat: TestDeckBallotFormat;
  includeOvervotedBallots?: boolean;
  includeBlankBallots?: boolean;
}

export function generateTestDeckBallots({
  election,
  precinctId,
  ballotFormat,
  includeOvervotedBallots = true,
  includeBlankBallots = true,
}: GenerateTestDeckParams): TestDeckBallot[] {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id);

  const ballots: TestDeckBallot[] = [];

  for (const currentPrecinctId of precincts) {
    const precinct = find(
      election.precincts,
      (p) => p.id === currentPrecinctId
    );
    const precinctBallotStyles = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    );

    for (const ballotStyle of precinctBallotStyles) {
      const contests = getContests({ election, ballotStyle });

      const numBallots = Math.max(
        ...contests.map((c) => numBallotPositions(c))
      );

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
        const votes: VotesDict = {};
        for (const contest of contests) {
          if (contest.type === 'straight-party') {
            const { parties } = election;
            if (parties.length > 0) {
              const party = assertDefined(parties[ballotNum % parties.length]);
              votes[contest.id] = [party.id];
            }
          } else if (contest.type === 'yesno') {
            votes[contest.id] =
              ballotNum % 2 === 0
                ? [contest.yesOption.id]
                : [contest.noOption.id];
          } else if (
            contest.type === 'candidate' &&
            contest.candidates.length > 0 // safety check
          ) {
            const choiceIndex = ballotNum % numBallotPositions(contest);
            votes[contest.id] = [
              getTestDeckCandidateAtIndex(contest, choiceIndex),
            ];
          }
        }
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId: currentPrecinctId,
          ballotFormat,
          votes,
        });
      }

      // Overvote and blank ballots only make sense for HMPB test decks
      if (ballotFormat === 'bubble') {
        if (includeOvervotedBallots) {
          // Generates a minimally overvoted ballot - a single overvote in the
          // first contest where an overvote is possible. Does not overvote
          // candidate contests where you must select a write-in to overvote. See
          // discussion: https://github.com/votingworks/vxsuite/issues/1711.
          const overvoteContest = contests.find(
            (contest) =>
              contest.type === 'yesno' ||
              (contest.type === 'candidate' &&
                contest.candidates.length > contest.seats)
          );
          if (overvoteContest) {
            let overvoteVote: VotesDict[string];
            if (overvoteContest.type === 'yesno') {
              overvoteVote = [
                overvoteContest.yesOption.id,
                overvoteContest.noOption.id,
              ];
            } else if (overvoteContest.type === 'candidate') {
              overvoteVote = iter(overvoteContest.candidates)
                .take(overvoteContest.seats + 1)
                .toArray();
            } else {
              continue;
            }
            ballots.push({
              ballotStyleId: ballotStyle.id,
              precinctId: currentPrecinctId,
              ballotFormat,
              votes: {
                [overvoteContest.id]: overvoteVote,
              },
            });
          }
        }

        if (includeBlankBallots) {
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            ballotFormat,
            votes: {},
          });
          ballots.push({
            ballotStyleId: ballotStyle.id,
            precinctId: currentPrecinctId,
            ballotFormat,
            votes: {},
          });
        }
      }
    }
  }

  return ballots;
}

/**
 * Finds the two parties with the most candidates across all contests.
 * Returns them in order of candidate count (most first).
 */
function findTwoMainParties(
  election: Election,
  contests: AnyContest[]
): [PartyId, PartyId] {
  const candidateContests = contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const partyCounts = new Map<PartyId, number>();
  for (const contest of candidateContests) {
    for (const candidate of contest.candidates) {
      for (const partyId of candidate.partyIds ?? []) {
        partyCounts.set(partyId, (partyCounts.get(partyId) ?? 0) + 1);
      }
    }
  }
  const sorted = [...partyCounts.entries()].sort((a, b) => b[1] - a[1]);
  assert(sorted.length >= 2, 'Need at least 2 parties for straight-party');
  return [sorted[0][0], sorted[1][0]];
}

/**
 * Generates a purpose-built test deck (3 ballots) for straight-party
 * expansion scenarios. Only applicable for elections with a straight-party
 * contest.
 *
 * Ballot 1: Primary party straight-party + mixed marks testing:
 *   cross-party override, basic expansion, same-party explicit,
 *   non-deterministic multi-seat, deterministic multi-seat, overvote
 *
 * Ballot 2: Secondary party straight-party, all contests blank (full expansion)
 *
 * Ballot 3: Straight-party overvote (both parties marked), one explicit vote
 */
export function generateStraightPartyTestDeckBallots(
  election: Election
): TestDeckBallot[] {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest) return [];

  const precinctId = election.precincts[0].id;
  const ballotStyle = assertDefined(
    election.ballotStyles.find((bs) => bs.precincts.includes(precinctId))
  );
  const contests = getContests({ election, ballotStyle });
  const [partyA, partyB] = findTwoMainParties(election, contests);

  const candidateContests = contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const singleSeatPartisan = candidateContests.filter(
    (c) =>
      c.seats === 1 &&
      c.candidates.some((cand) => cand.partyIds?.includes(partyA))
  );
  const multiSeatPartisan = candidateContests.filter(
    (c) =>
      c.seats > 1 &&
      c.candidates.some((cand) => cand.partyIds?.includes(partyA))
  );

  // --- Ballot 1: partyA straight-party + mixed marks ---
  const ballot1Votes: VotesDict = {};
  ballot1Votes[straightPartyContest.id] = [partyA];

  const assigned = { crossParty: false, explicit: false, overvote: false };

  for (const contest of singleSeatPartisan) {
    const partyACands = contest.candidates.filter(
      (c) => c.partyIds?.includes(partyA)
    );
    const partyBCands = contest.candidates.filter(
      (c) => c.partyIds?.includes(partyB)
    );

    if (!assigned.crossParty && partyBCands.length > 0) {
      // Cross-party override: vote for partyB candidate
      ballot1Votes[contest.id] = [partyBCands[0]];
      assigned.crossParty = true;
    } else if (!assigned.explicit && partyACands.length > 0) {
      // Same-party explicit mark
      ballot1Votes[contest.id] = [partyACands[0]];
      assigned.explicit = true;
    } else if (
      !assigned.overvote &&
      partyACands.length > 0 &&
      partyBCands.length > 0
    ) {
      // Individual overvote: mark both party candidates
      ballot1Votes[contest.id] = [partyACands[0], partyBCands[0]];
      assigned.overvote = true;
    }
    // Otherwise: leave blank for basic expansion
  }

  let assignedDeterministic = false;
  for (const contest of multiSeatPartisan) {
    const partyACands = contest.candidates.filter(
      (c) => c.partyIds?.includes(partyA)
    );
    const partyBCands = contest.candidates.filter(
      (c) => c.partyIds?.includes(partyB)
    );

    if (partyACands.length > contest.seats) {
      // Non-deterministic: more partyA candidates than seats.
      // Vote for 1 partyB candidate so 1 seat remains but multiple partyA
      // candidates compete for it → no expansion.
      if (partyBCands.length > 0) {
        ballot1Votes[contest.id] = [partyBCands[0]];
      }
    } else if (
      !assignedDeterministic &&
      partyACands.length === contest.seats &&
      partyACands.length > 1
    ) {
      // Deterministic partial: vote for 1 partyA candidate explicitly,
      // expansion fills the remaining seat with the other partyA candidate
      ballot1Votes[contest.id] = [partyACands[0]];
      assignedDeterministic = true;
    }
    // Otherwise: leave blank for full deterministic expansion
  }

  // --- Ballot 2: partyB straight-party, all contests blank ---
  const ballot2Votes: VotesDict = {};
  ballot2Votes[straightPartyContest.id] = [partyB];

  // --- Ballot 3: straight-party overvote (partyA + partyB) ---
  const ballot3Votes: VotesDict = {};
  ballot3Votes[straightPartyContest.id] = [partyA, partyB];
  // Add one explicit vote to show explicit votes survive overvoted straight-party
  const firstPartyAContest = singleSeatPartisan.find((c) =>
    c.candidates.some((cand) => cand.partyIds?.includes(partyA))
  );
  if (firstPartyAContest) {
    const partyACandidate = assertDefined(
      firstPartyAContest.candidates.find((c) => c.partyIds?.includes(partyA))
    );
    ballot3Votes[firstPartyAContest.id] = [partyACandidate];
  }

  return [
    {
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotFormat: 'bubble',
      votes: ballot1Votes,
    },
    {
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotFormat: 'bubble',
      votes: ballot2Votes,
    },
    {
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotFormat: 'bubble',
      votes: ballot3Votes,
    },
  ];
}

/**
 * Describes what scenario a contest tests in the straight-party test deck,
 * for use in the verification checklist.
 */
interface ContestChecklistEntry {
  contestTitle: string;
  scenario: string;
  markedDescription: string;
  expectedDescription: string;
}

/**
 * Generates a markdown verification checklist for the straight-party test deck.
 * Computes expected results by applying applyStraightPartyRules to the raw votes.
 */
export function generateStraightPartyVerificationChecklist(
  election: Election,
  ballots: TestDeckBallot[]
): string {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest) return '';

  const partyName = (partyId: PartyId) =>
    find(election.parties, (p) => p.id === partyId).name;

  const candidateName = (contest: CandidateContest, candidateId: string) =>
    find(contest.candidates, (c) => c.id === candidateId).name;

  const lines: string[] = ['# Straight-Party Test Deck Verification Checklist'];

  for (const [ballotIndex, ballot] of ballots.entries()) {
    const rawVotes = convertVotesDictToTabulationVotes(ballot.votes);
    const expandedVotes = applyStraightPartyRules(election, rawVotes);

    const spVote = rawVotes[straightPartyContest.id];
    let spDescription: string;
    if (!spVote || spVote.length === 0) {
      spDescription = 'None';
    } else if (spVote.length > 1) {
      spDescription = `OVERVOTE: ${spVote
        .map((id) => partyName(id as PartyId))
        .join(' + ')}`;
    } else {
      spDescription = partyName(spVote[0] as PartyId);
    }

    lines.push('');
    lines.push(`## Ballot ${ballotIndex + 1}`);
    lines.push(`**Straight-party selection:** ${spDescription}`);
    lines.push('');

    const entries: ContestChecklistEntry[] = [];

    for (const contest of election.contests) {
      if (contest.type === 'straight-party') continue;
      if (contest.type === 'yesno') {
        const rawYesNo = rawVotes[contest.id];
        if (!rawYesNo || rawYesNo.length === 0) {
          entries.push({
            contestTitle: contest.title,
            scenario: 'Ballot measure (unaffected by straight-party)',
            markedDescription: 'Blank',
            expectedDescription: 'No votes',
          });
        }
        continue;
      }
      if (contest.type !== 'candidate') continue;

      const rawContestVote = rawVotes[contest.id] ?? [];
      const expandedContestVote = expandedVotes[contest.id] ?? [];

      const markedNames =
        rawContestVote.length === 0
          ? 'Blank'
          : rawContestVote
              .map((id) => {
                const cand = contest.candidates.find((c) => c.id === id);
                if (!cand) return id;
                const party = cand.partyIds?.[0]
                  ? ` (${partyName(cand.partyIds[0] as PartyId)})`
                  : '';
                return `${cand.name}${party}`;
              })
              .join(', ');

      const isOvervote = rawContestVote.length > contest.seats;
      const wasExpanded = expandedContestVote.length > rawContestVote.length;
      const isNonPartisan = !contest.candidates.some(
        (c) => c.partyIds && c.partyIds.length > 0
      );

      let scenario: string;
      let expectedDescription: string;

      if (isOvervote) {
        scenario = 'Individual contest overvote';
        expectedDescription = `Overvote (${rawContestVote.length} marks for ${contest.seats} seat(s))`;
      } else if (isNonPartisan) {
        scenario = 'Non-partisan contest (unaffected)';
        expectedDescription =
          expandedContestVote.length === 0
            ? 'No votes'
            : expandedContestVote
                .map((id) => candidateName(contest, id))
                .join(', ');
      } else if (wasExpanded) {
        const addedVotes = expandedContestVote.filter(
          (id) => !rawContestVote.includes(id)
        );
        const addedNames = addedVotes
          .map((id) => `${candidateName(contest, id)} (expanded)`)
          .join(', ');
        const existingNames = rawContestVote
          .map((id) => candidateName(contest, id))
          .join(', ');
        scenario =
          rawContestVote.length === 0
            ? 'Full expansion (blank → filled by straight-party)'
            : 'Deterministic expansion (partial fill)';
        expectedDescription = existingNames
          ? `${existingNames}, ${addedNames}`
          : addedNames;
      } else if (rawContestVote.length > 0) {
        const markedPartyIds =
          contest.candidates
            .find((c) => c.id === rawContestVote[0])
            ?.partyIds?.map((p) => p as PartyId) ?? [];
        const isCrossParty =
          spVote?.length === 1 &&
          markedPartyIds.length > 0 &&
          !markedPartyIds.includes(spVote[0] as PartyId);
        scenario = isCrossParty
          ? 'Cross-party override'
          : 'Same-party explicit mark';
        expectedDescription = rawContestVote
          .map((id) => candidateName(contest, id))
          .join(', ');
      } else {
        // Blank + no expansion
        const selectedParty =
          spVote?.length === 1 ? (spVote[0] as PartyId) : undefined;
        const partyACands = selectedParty
          ? contest.candidates.filter(
              (c) => c.partyIds?.includes(selectedParty)
            )
          : [];
        if (
          selectedParty &&
          partyACands.length > 0 &&
          partyACands.length > contest.seats
        ) {
          scenario = 'Non-deterministic (too many party candidates for seats)';
          expectedDescription = `No expansion — ${partyACands.length} candidates for ${contest.seats} seat(s), ${contest.seats} undervote(s)`;
        } else if (partyACands.length === 0) {
          scenario = 'No party candidates available';
          expectedDescription = 'No votes';
        } else {
          scenario = 'No expansion';
          expectedDescription = 'No votes';
        }
      }

      entries.push({
        contestTitle: contest.title,
        scenario,
        markedDescription: markedNames,
        expectedDescription,
      });
    }

    for (const entry of entries) {
      lines.push(`### ${entry.contestTitle}`);
      lines.push(`- **Scenario:** ${entry.scenario}`);
      lines.push(`- **Marked:** ${entry.markedDescription}`);
      lines.push(`- **Expected result:** ${entry.expectedDescription}`);
      lines.push('- [ ] Verify in tally report');
      lines.push('');
    }
  }

  return lines.join('\n');
}
