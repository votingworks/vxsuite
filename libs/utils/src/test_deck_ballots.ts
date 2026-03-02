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
 * Returns parties ranked by candidate count (most candidates first).
 */
function rankPartiesByCandidateCount(
  contests: readonly AnyContest[]
): PartyId[] {
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
  return [...partyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Each contest in the straight-party test deck tests exactly one scenario.
 * This type tags which scenario a contest is assigned to.
 */
export type ContestScenario =
  | 'basic-expansion'
  | 'cross-party-override'
  | 'same-party-explicit'
  | 'individual-overvote'
  | 'deterministic-expansion'
  | 'non-deterministic'
  | 'straight-party-overvote-explicit'
  | 'non-partisan'
  | 'write-in-blocks-expansion'
  | 'write-in-with-expansion';

export interface ContestAssignment {
  contest: CandidateContest;
  scenario: ContestScenario;
  ballotIndex: number;
}

export interface StraightPartyTestDeckResult {
  ballots: TestDeckBallot[];
  assignments: ContestAssignment[];
  skippedScenarios: ContestScenario[];
}

/**
 * Generates a purpose-built test deck for straight-party expansion scenarios.
 * Each contest tests exactly one scenario across all ballots, so the tally
 * report unambiguously shows whether that scenario was handled correctly.
 *
 * Ballot 1: Party A straight-party — each contest tests one scenario:
 *   basic expansion, cross-party override, same-party explicit,
 *   individual overvote, deterministic expansion, non-deterministic
 *
 * Ballot 2: Straight-party overvote (Party A + Party B) — one contest
 *   has an explicit vote to verify explicit votes survive overvoted SP
 *
 * Ballot 3 (if 3+ parties): Party C straight-party, all contests blank —
 *   clean expansion test using a party not involved in any other scenario
 */
export function generateStraightPartyTestDeckBallots(
  election: Election
): StraightPartyTestDeckResult {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest)
    return { ballots: [], assignments: [], skippedScenarios: [] };

  const precinctId = assertDefined(election.precincts[0]).id;
  const ballotStyle = assertDefined(
    election.ballotStyles.find((bs) => bs.precincts.includes(precinctId))
  );
  const contests = getContests({ election, ballotStyle });
  const rankedParties = rankPartiesByCandidateCount(contests);
  assert(
    rankedParties.length >= 2,
    'Need at least 2 parties for straight-party'
  );
  const partyA = assertDefined(rankedParties[0]);
  const partyB = assertDefined(rankedParties[1]);
  const partyC = rankedParties[2]; // may be undefined

  const BALLOT_1_INDEX = 0;
  const BALLOT_2_INDEX = 1;

  const candidateContests = [...contests].filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );

  function partyACandCount(contest: CandidateContest): number {
    return contest.candidates.filter((c) => c.partyIds?.includes(partyA))
      .length;
  }

  function hasPartyBCandidate(contest: CandidateContest): boolean {
    return contest.candidates.some((c) => c.partyIds?.includes(partyB));
  }

  // Define each scenario's qualification criteria and ballot placement
  interface ScenarioSpec {
    scenario: ContestScenario;
    ballotIndex: number;
    qualifies: (c: CandidateContest) => boolean;
  }
  const scenarioSpecs: ScenarioSpec[] = [
    {
      scenario: 'basic-expansion',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) => c.seats === 1 && partyACandCount(c) > 0,
    },
    {
      scenario: 'cross-party-override',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) =>
        c.seats === 1 && partyACandCount(c) > 0 && hasPartyBCandidate(c),
    },
    {
      scenario: 'same-party-explicit',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) => c.seats === 1 && partyACandCount(c) > 0,
    },
    {
      scenario: 'individual-overvote',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) =>
        c.seats === 1 && partyACandCount(c) > 0 && hasPartyBCandidate(c),
    },
    {
      scenario: 'write-in-blocks-expansion',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) =>
        c.seats === 1 && partyACandCount(c) > 0 && c.allowWriteIns,
    },
    {
      scenario: 'write-in-with-expansion',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) => {
        const count = partyACandCount(c);
        return c.seats > 1 && c.allowWriteIns && count > 0 && count <= c.seats - 1;
      },
    },
    {
      scenario: 'deterministic-expansion',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) => {
        const count = partyACandCount(c);
        return c.seats > 1 && count > 1 && count <= c.seats;
      },
    },
    {
      scenario: 'non-deterministic',
      ballotIndex: BALLOT_1_INDEX,
      // We can trigger non-deterministic expansion in any multi-seat contest
      // by voting for enough non-party-A candidates to make remaining seats
      // fewer than unselected party A candidates. Needs at least one non-party-A
      // candidate and more party A candidates than seats - 1.
      qualifies: (c) => {
        const partyACount = partyACandCount(c);
        const hasNonPartyA = c.candidates.some(
          (cand) => !cand.partyIds?.includes(partyA)
        );
        return c.seats > 1 && partyACount > 0 && hasNonPartyA;
      },
    },
    {
      scenario: 'non-partisan',
      ballotIndex: BALLOT_1_INDEX,
      qualifies: (c) => !c.candidates.some((cand) => cand.partyIds?.length),
    },
    {
      scenario: 'straight-party-overvote-explicit',
      ballotIndex: BALLOT_2_INDEX,
      qualifies: (c) => c.seats === 1 && partyACandCount(c) > 0,
    },
  ];

  // Assign each contest to exactly one scenario. Process most-constrained
  // scenarios first (fewest qualifying contests), but always assign
  // basic-expansion first so it gets the earliest contest on the ballot.
  const assignments: ContestAssignment[] = [];
  const assignedContestIds = new Set<string>();

  function assign(spec: ScenarioSpec): boolean {
    for (const contest of candidateContests) {
      if (assignedContestIds.has(contest.id)) continue;
      if (!spec.qualifies(contest)) continue;
      assignments.push({
        contest,
        scenario: spec.scenario,
        ballotIndex: spec.ballotIndex,
      });
      assignedContestIds.add(contest.id);
      return true;
    }
    return false;
  }

  // Split scenarios into applicable (qualifying contests exist) and
  // inapplicable (no contests in the election match). Inapplicable
  // scenarios are noted in the checklist rather than silently dropped.
  const skippedScenarios: ContestScenario[] = [];
  const applicableSpecs: ScenarioSpec[] = [];
  for (const spec of scenarioSpecs) {
    if (candidateContests.some((c) => spec.qualifies(c))) {
      applicableSpecs.push(spec);
    } else {
      skippedScenarios.push(spec.scenario);
    }
  }

  const basicExpansion = assertDefined(
    applicableSpecs.find((s) => s.scenario === 'basic-expansion')
  );
  assert(assign(basicExpansion), 'Failed to assign basic-expansion');

  // Sort remaining by constraint level (fewest qualifying unassigned
  // contests first) so the most constrained get first pick.
  const remaining = applicableSpecs
    .filter((s) => s.scenario !== 'basic-expansion')
    .sort(
      (a, b) =>
        candidateContests.filter(
          (c) => !assignedContestIds.has(c.id) && a.qualifies(c)
        ).length -
        candidateContests.filter(
          (c) => !assignedContestIds.has(c.id) && b.qualifies(c)
        ).length
    );

  for (const spec of remaining) {
    assert(
      assign(spec),
      `Could not assign a contest for scenario: ${spec.scenario}. ` +
        `Qualifying contests exist but were all consumed by other scenarios.`
    );
  }

  // --- Ballot 1: Party A straight-party ---
  const ballot1Votes: VotesDict = {};
  ballot1Votes[straightPartyContest.id] = [partyA];

  // --- Ballot 2: Straight-party overvote (Party A + Party B) ---
  const ballot2Votes: VotesDict = {};
  ballot2Votes[straightPartyContest.id] = [partyA, partyB];

  for (const { contest, scenario, ballotIndex } of assignments) {
    const targetVotes =
      ballotIndex === BALLOT_1_INDEX ? ballot1Votes : ballot2Votes;
    const partyACands = contest.candidates.filter(
      (c) => c.partyIds?.includes(partyA)
    );
    const partyBCands = contest.candidates.filter(
      (c) => c.partyIds?.includes(partyB)
    );

    switch (scenario) {
      case 'basic-expansion':
        break;
      case 'cross-party-override':
        targetVotes[contest.id] = [assertDefined(partyBCands[0])];
        break;
      case 'same-party-explicit':
        targetVotes[contest.id] = [assertDefined(partyACands[0])];
        break;
      case 'individual-overvote':
        targetVotes[contest.id] = [
          assertDefined(partyACands[0]),
          assertDefined(partyBCands[0]),
        ];
        break;
      case 'deterministic-expansion':
        targetVotes[contest.id] = [assertDefined(partyACands[0])];
        break;
      case 'non-deterministic': {
        // Vote for enough non-party-A candidates so that remaining seats
        // are fewer than unselected party A candidates, making expansion
        // non-deterministic.
        const nonPartyACands = contest.candidates.filter(
          (c) => !c.partyIds?.includes(partyA)
        );
        const votesNeeded = Math.max(1, partyACands.length - contest.seats + 1);
        targetVotes[contest.id] = nonPartyACands.slice(0, votesNeeded);
        break;
      }
      case 'straight-party-overvote-explicit':
        targetVotes[contest.id] = [assertDefined(partyACands[0])];
        break;
      case 'non-partisan':
        targetVotes[contest.id] = [assertDefined(contest.candidates[0])];
        break;
      case 'write-in-blocks-expansion':
        targetVotes[contest.id] = [generateTestDeckWriteIn(0)];
        break;
      case 'write-in-with-expansion':
        targetVotes[contest.id] = [generateTestDeckWriteIn(0)];
        break;
      default:
        break;
    }
  }

  const ballots: TestDeckBallot[] = [
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
  ];

  // --- Ballot 3: Party C straight-party (if available) ---
  if (partyC) {
    const ballot3Votes: VotesDict = {};
    ballot3Votes[straightPartyContest.id] = [partyC];
    ballots.push({
      ballotStyleId: ballotStyle.id,
      precinctId,
      ballotFormat: 'bubble',
      votes: ballot3Votes,
    });
  }

  return { ballots, assignments, skippedScenarios };
}

const SCENARIO_TITLES: Record<ContestScenario, string> = {
  'basic-expansion': 'Basic Expansion',
  'cross-party-override': 'Cross-Party Override',
  'same-party-explicit': 'Same-Party Explicit Mark',
  'individual-overvote': 'Individual Contest Overvote',
  'deterministic-expansion': 'Deterministic Multi-Seat Expansion',
  'non-deterministic': 'Non-Deterministic (No Expansion)',
  'straight-party-overvote-explicit':
    'Explicit Vote Survives Straight-Party Overvote',
  'non-partisan': 'Non-Partisan Contest',
  'write-in-blocks-expansion': 'Write-In Blocks Expansion',
  'write-in-with-expansion': 'Write-In With Expansion',
};

const SCENARIO_DESCRIPTIONS: Record<ContestScenario, string> = {
  'basic-expansion':
    "No explicit marks were made in this contest, so straight-party expansion should fill all seats with the selected party's candidates.",
  'cross-party-override':
    "An explicit vote for the opposing party's candidate should override straight-party expansion for this contest.",
  'same-party-explicit':
    "An explicit vote for the selected party's candidate was made, so the result should be the same as expansion but the mark is explicit.",
  'individual-overvote':
    'More candidates were marked than seats available, so the entire contest should be overvoted and no votes should count despite the straight-party selection.',
  'deterministic-expansion':
    "Some seats were filled explicitly, and straight-party expansion should fill the remaining seats with the selected party's unselected candidates.",
  'non-deterministic':
    'There are more party candidates than seats, so expansion is skipped because the system cannot determine which candidates the voter intended.',
  'straight-party-overvote-explicit':
    'The straight-party contest itself is overvoted (multiple parties selected), so no expansion occurs, but explicit votes in individual contests should still count.',
  'non-partisan':
    'This contest has no party-affiliated candidates, so straight-party should have no effect and only explicit marks should count.',
  'write-in-blocks-expansion':
    'A write-in fills the only available seat, so there are no remaining seats for straight-party expansion.',
  'write-in-with-expansion':
    "A write-in fills one seat, but remaining seats should still be filled by straight-party expansion with the selected party's candidates.",
};

function isWriteInId(id: string): boolean {
  return id === 'write-in' || id.startsWith('write-in-');
}

/**
 * Generates a markdown verification checklist for the straight-party test deck.
 * Organized by scenario — each section describes one test case and its expected
 * result, making it easy to verify against the tally report.
 */
export function generateStraightPartyVerificationChecklist(
  election: Election,
  { ballots, assignments, skippedScenarios }: StraightPartyTestDeckResult
): string {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest) return '';

  const partyName = (partyId: PartyId) =>
    find(election.parties, (p) => p.id === partyId).name;

  const ballot1 = assertDefined(ballots[0]);
  const ballotStyle = assertDefined(
    election.ballotStyles.find((bs) => bs.id === ballot1.ballotStyleId)
  );
  const contests = getContests({ election, ballotStyle });

  const lines: string[] = [
    '# Straight-Party Test Deck Verification Checklist',
    '',
  ];

  // Describe the ballots
  for (const [i, ballot] of ballots.entries()) {
    const rawVotes = convertVotesDictToTabulationVotes(ballot.votes);
    const spVote = rawVotes[straightPartyContest.id];
    let spDescription: string;
    if (!spVote || spVote.length === 0) {
      spDescription = 'None';
    } else if (spVote.length > 1) {
      spDescription = `Overvote: ${spVote
        .map((id) => partyName(id as PartyId))
        .join(' + ')}`;
    } else {
      spDescription = partyName(spVote[0] as PartyId);
    }
    lines.push(`**Ballot ${i + 1}:** Straight-party = ${spDescription}`);
  }

  lines.push('');

  const contestOrder = new Map(contests.map((c, i) => [c.id, i]));

  // Sort by ballot first, then by contest order on the ballot
  const sortedAssignments = [...assignments].sort(
    (a, b) =>
      a.ballotIndex - b.ballotIndex ||
      (contestOrder.get(a.contest.id) ?? 0) -
        (contestOrder.get(b.contest.id) ?? 0)
  );
  for (const [
    i,
    { contest, scenario, ballotIndex },
  ] of sortedAssignments.entries()) {
    const ballot = assertDefined(ballots[ballotIndex]);
    const rawVotes = convertVotesDictToTabulationVotes(ballot.votes);
    const expandedVotes = applyStraightPartyRules(election, rawVotes);

    const rawContestVote = rawVotes[contest.id] ?? [];
    const expandedContestVote = expandedVotes[contest.id] ?? [];

    const markedNames =
      rawContestVote.length === 0
        ? 'Blank'
        : rawContestVote
            .map((id) => {
              if (isWriteInId(id)) return 'WRITE-IN';
              const cand = contest.candidates.find((c) => c.id === id);
              if (!cand) return id;
              const party = cand.partyIds?.[0]
                ? ` (${partyName(cand.partyIds[0] as PartyId)})`
                : '';
              return `${cand.name}${party}`;
            })
            .join(', ');

    const isOvervote = rawContestVote.length > contest.seats;
    let expectedDescription: string;

    if (isOvervote) {
      expectedDescription = `Overvote (${rawContestVote.length} marks for ${contest.seats} seat(s))`;
    } else if (expandedContestVote.length === 0) {
      expectedDescription = 'No votes';
    } else {
      expectedDescription = expandedContestVote
        .map((id) => {
          if (isWriteInId(id)) return 'WRITE-IN';
          const cand = contest.candidates.find((c) => c.id === id);
          if (!cand) return id;
          const wasAdded = !rawContestVote.includes(id);
          return wasAdded ? `${cand.name} (expanded)` : cand.name;
        })
        .join(', ');
    }

    lines.push(`## ${i + 1}. ${SCENARIO_TITLES[scenario]}`);
    lines.push(SCENARIO_DESCRIPTIONS[scenario]);
    lines.push(`- **Ballot:** ${ballotIndex + 1}`);
    lines.push(`- **Contest:** ${contest.title}`);
    lines.push(`- **Marked:** ${markedNames}`);
    lines.push(`- **Expected result:** ${expectedDescription}`);
    lines.push('');
  }

  if (skippedScenarios.length > 0) {
    lines.push('## Skipped Scenarios');
    lines.push(
      'The following scenarios could not be tested because this election has no contests that match their requirements:'
    );
    lines.push('');
    for (const scenario of skippedScenarios) {
      lines.push(
        `- **${SCENARIO_TITLES[scenario]}:** ${SCENARIO_DESCRIPTIONS[scenario]}`
      );
    }
    lines.push('');
  }

  // Party C expansion section (if ballot 3 exists)
  if (ballots.length >= 3) {
    const ballot3 = assertDefined(ballots[2]);
    const rawVotes = convertVotesDictToTabulationVotes(ballot3.votes);
    const spVote = rawVotes[straightPartyContest.id];
    const partyId = spVote?.[0] as PartyId | undefined;
    const party = partyId ? partyName(partyId) : 'third party';

    lines.push(
      `## ${sortedAssignments.length + 1}. Clean Expansion (Separate Party)`
    );
    lines.push(
      `Ballot 3 selects ${party} with all contests blank. Every partisan contest should show exactly 1 vote for the ${party} candidate via expansion. Since ${party} is not involved in any other test scenario, these votes are unambiguous.`
    );
    lines.push('');
  }

  return lines.join('\n');
}
