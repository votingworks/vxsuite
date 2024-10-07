import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  AnyContest,
  CandidateContest,
  ContestOptionId,
  MarkStatus,
  WriteInAreaStatus,
  YesNoContest,
} from '@votingworks/types';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { assert, find } from '@votingworks/basics';
import { allContestOptions } from '@votingworks/utils';
import {
  getAllPossibleAdjudicationReasons,
  adjudicationReasonDescription,
} from './adjudication_reasons';

const bestAnimalMammal =
  electionTwoPartyPrimaryDefinition.election.contests.find(
    ({ id }) => id === 'best-animal-mammal'
  ) as CandidateContest;
const zooCouncilMammal =
  electionTwoPartyPrimaryDefinition.election.contests.find(
    ({ id }) => id === 'zoo-council-mammal'
  ) as CandidateContest;
const [bestAnimalMammalCandidate1, bestAnimalMammalCandidate2] =
  bestAnimalMammal.candidates;
assert(bestAnimalMammalCandidate1 && bestAnimalMammalCandidate2);
const [
  zooCouncilMammalCandidate1,
  zooCouncilMammalCandidate2,
  zooCouncilMammalCandidate3,
  zooCouncilMammalCandidate4,
] = zooCouncilMammal.candidates;
assert(
  zooCouncilMammalCandidate1 &&
    zooCouncilMammalCandidate2 &&
    zooCouncilMammalCandidate3 &&
    zooCouncilMammalCandidate4
);
const ballotMeasure3 = electionTwoPartyPrimaryDefinition.election.contests.find(
  ({ id }) => id === 'fishing'
) as YesNoContest;

type GetAllPossibleAdjudicationReasonsOptionStatus = Parameters<
  typeof getAllPossibleAdjudicationReasons
>[1][0];

function generateMockContestOptionScores(
  contest: AnyContest,
  overrides: Record<
    ContestOptionId,
    { markStatus?: MarkStatus; writeInAreaStatus?: WriteInAreaStatus }
  >
): GetAllPossibleAdjudicationReasonsOptionStatus[] {
  return [...allContestOptions(contest)].map((option) => ({
    option,
    markStatus: overrides[option.id]?.markStatus ?? MarkStatus.Unmarked,
    writeInAreaStatus:
      overrides[option.id]?.writeInAreaStatus ?? WriteInAreaStatus.Ignored,
  }));
}

test('a ballot with no adjudication reasons', () => {
  expect(
    getAllPossibleAdjudicationReasons(
      [bestAnimalMammal],
      generateMockContestOptionScores(bestAnimalMammal, {
        [bestAnimalMammalCandidate1.id]: { markStatus: MarkStatus.Marked },
      })
    )
  ).toEqual([]);
});

test('a ballot with marginal marks', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [bestAnimalMammal],
    generateMockContestOptionScores(bestAnimalMammal, {
      [bestAnimalMammalCandidate1.id]: { markStatus: MarkStatus.Marked },
      [bestAnimalMammalCandidate2.id]: { markStatus: MarkStatus.Marginal },
    })
  );

  expect(reasons).toEqual<AdjudicationReasonInfo[]>([
    {
      type: AdjudicationReason.MarginalMark,
      contestId: bestAnimalMammal.id,
      optionId: bestAnimalMammalCandidate2.id,
    },
  ]);

  expect(reasons.map(adjudicationReasonDescription)).toEqual([
    "Contest 'best-animal-mammal' has a marginal mark for option 'otter'.",
  ]);
});

test('a ballot with no marks', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [bestAnimalMammal],
    generateMockContestOptionScores(bestAnimalMammal, {})
  );

  expect(reasons).toEqual<AdjudicationReasonInfo[]>([
    {
      type: AdjudicationReason.Undervote,
      contestId: bestAnimalMammal.id,
      optionIds: [],
      expected: 1,
    },
    {
      type: AdjudicationReason.BlankBallot,
    },
  ]);

  expect(reasons.map(adjudicationReasonDescription)).toEqual([
    "Contest 'best-animal-mammal' is undervoted, expected 1 but got none.",
    'Ballot has no votes.',
  ]);
});

test('a ballot page with no contests', () => {
  const reasons = getAllPossibleAdjudicationReasons([], []);

  // Notably, there is no BlankBallot adjudication reason.
  expect(reasons).toEqual([]);
});

test('a ballot with too many marks', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [bestAnimalMammal],
    generateMockContestOptionScores(bestAnimalMammal, {
      [bestAnimalMammalCandidate1.id]: { markStatus: MarkStatus.Marked },
      [bestAnimalMammalCandidate2.id]: { markStatus: MarkStatus.Marked },
    })
  );

  expect(reasons).toEqual<AdjudicationReasonInfo[]>([
    {
      type: AdjudicationReason.Overvote,
      contestId: bestAnimalMammal.id,
      optionIds: [bestAnimalMammalCandidate1.id, bestAnimalMammalCandidate2.id],
      expected: 1,
    },
  ]);

  expect(reasons.map(adjudicationReasonDescription)).toEqual([
    "Contest 'best-animal-mammal' is overvoted, expected 1 but got 2: 'horse', 'otter'.",
  ]);
});

test('multiple contests with issues', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [bestAnimalMammal, zooCouncilMammal],
    [
      ...generateMockContestOptionScores(bestAnimalMammal, {
        [bestAnimalMammalCandidate1.id]: { markStatus: MarkStatus.Marginal },
      }),
      ...generateMockContestOptionScores(zooCouncilMammal, {
        [zooCouncilMammalCandidate1.id]: { markStatus: MarkStatus.Marked },
        [zooCouncilMammalCandidate2.id]: { markStatus: MarkStatus.Marked },
        [zooCouncilMammalCandidate3.id]: { markStatus: MarkStatus.Marked },
        [zooCouncilMammalCandidate4.id]: { markStatus: MarkStatus.Marked },
      }),
    ]
  );

  expect(reasons).toEqual<AdjudicationReasonInfo[]>([
    {
      type: AdjudicationReason.MarginalMark,
      contestId: bestAnimalMammal.id,
      optionId: bestAnimalMammalCandidate1.id,
    },
    {
      type: AdjudicationReason.Undervote,
      contestId: bestAnimalMammal.id,
      optionIds: [],
      expected: 1,
    },
    {
      type: AdjudicationReason.Overvote,
      contestId: zooCouncilMammal.id,
      optionIds: [
        zooCouncilMammalCandidate1.id,
        zooCouncilMammalCandidate2.id,
        zooCouncilMammalCandidate3.id,
        zooCouncilMammalCandidate4.id,
      ],
      expected: 3,
    },
  ]);

  expect(reasons.map(adjudicationReasonDescription)).toEqual([
    "Contest 'best-animal-mammal' has a marginal mark for option 'horse'.",
    "Contest 'best-animal-mammal' is undervoted, expected 1 but got none.",
    "Contest 'zoo-council-mammal' is overvoted, expected 3 but got 4: 'zebra', 'lion', 'kangaroo', 'elephant'.",
  ]);
});

test('yesno contest overvotes', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [ballotMeasure3],
    generateMockContestOptionScores(ballotMeasure3, {
      'ban-fishing': { markStatus: MarkStatus.Marked },
      'allow-fishing': { markStatus: MarkStatus.Marked },
    })
  );

  expect(reasons).toEqual<AdjudicationReasonInfo[]>([
    {
      type: AdjudicationReason.Overvote,
      contestId: ballotMeasure3.id,
      optionIds: [ballotMeasure3.yesOption.id, ballotMeasure3.noOption.id],
      expected: 1,
    },
  ]);

  expect(reasons.map(adjudicationReasonDescription)).toEqual([
    "Contest 'fishing' is overvoted, expected 1 but got 2: 'ban-fishing', 'allow-fishing'.",
  ]);
});

test('a ballot with just a write-in', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [zooCouncilMammal],
    generateMockContestOptionScores(zooCouncilMammal, {
      'write-in-0': { markStatus: MarkStatus.Marked },
    })
  );

  // in particular, no write-in adjudication reason anymore.
  expect(reasons).toEqual([
    {
      contestId: 'zoo-council-mammal',
      expected: 3,
      optionIds: ['write-in-0'],
      type: 'Undervote',
    },
  ]);
});

test('an unmarked write-in is ignored in undervote cases', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [zooCouncilMammal],
    generateMockContestOptionScores(zooCouncilMammal, {
      'write-in-0': { writeInAreaStatus: WriteInAreaStatus.Filled },
    })
  );

  expect(reasons).toEqual([
    {
      contestId: 'zoo-council-mammal',
      expected: 3,
      optionIds: [],
      type: 'Undervote',
    },
    {
      type: 'BlankBallot',
    },
  ]);
});

test('an unmarked write-in can trigger the overvote reason', () => {
  const reasons = getAllPossibleAdjudicationReasons(
    [zooCouncilMammal],
    generateMockContestOptionScores(zooCouncilMammal, {
      [zooCouncilMammalCandidate1.id]: { markStatus: MarkStatus.Marked },
      [zooCouncilMammalCandidate2.id]: { markStatus: MarkStatus.Marked },
      [zooCouncilMammalCandidate3.id]: { markStatus: MarkStatus.Marked },
      'write-in-0': { writeInAreaStatus: WriteInAreaStatus.Filled },
    })
  );

  expect(reasons).toEqual([
    {
      contestId: 'zoo-council-mammal',
      expected: 3,
      optionIds: ['zebra', 'lion', 'kangaroo', 'write-in-0'],
      type: 'Overvote',
    },
  ]);
});

describe('multiple marks for the same candidate', () => {
  const mockContestOptionScores = generateMockContestOptionScores(
    zooCouncilMammal,
    {
      zebra: { markStatus: MarkStatus.Marked },
      lion: { markStatus: MarkStatus.Marked },
      kangaroo: { markStatus: MarkStatus.Marked },
    }
  );

  const mockContestOptionScoresWithoutZebra = mockContestOptionScores.filter(
    (c) => c.option.id !== 'zebra'
  );
  const markedZebraOption = find(
    mockContestOptionScores,
    (c) => c.option.id === 'zebra'
  );
  const marginalZebraOption: GetAllPossibleAdjudicationReasonsOptionStatus = {
    ...markedZebraOption,
    markStatus: MarkStatus.Marginal,
  };
  const unmarkedZebraOption: GetAllPossibleAdjudicationReasonsOptionStatus = {
    ...markedZebraOption,
    markStatus: MarkStatus.Unmarked,
  };

  const marginalAdjudicationReason: AdjudicationReasonInfo = {
    type: AdjudicationReason.MarginalMark,
    contestId: zooCouncilMammal.id,
    optionId: zooCouncilMammalCandidate1.id,
  };
  const undervoteAdjudicationReason: AdjudicationReasonInfo = {
    type: AdjudicationReason.Undervote,
    contestId: zooCouncilMammal.id,
    optionIds: ['lion', 'kangaroo'],
    expected: 3,
  };

  test.each<{
    description: string;
    zebraOptionA: GetAllPossibleAdjudicationReasonsOptionStatus;
    zebraOptionB: GetAllPossibleAdjudicationReasonsOptionStatus;
    expected: AdjudicationReasonInfo[];
  }>([
    {
      description: 'marked, marked',
      zebraOptionA: markedZebraOption,
      zebraOptionB: markedZebraOption,
      expected: [],
    },
    {
      description: 'marked, unmarked',
      zebraOptionA: markedZebraOption,
      zebraOptionB: unmarkedZebraOption,
      expected: [],
    },
    {
      description: 'unmarked, marked',
      zebraOptionA: unmarkedZebraOption,
      zebraOptionB: markedZebraOption,
      expected: [],
    },
    {
      description: 'marked, marginal',
      zebraOptionA: markedZebraOption,
      zebraOptionB: marginalZebraOption,
      expected: [],
    },
    {
      description: 'marginal, marked',
      zebraOptionA: marginalZebraOption,
      zebraOptionB: markedZebraOption,
      expected: [],
    },
    {
      description: 'marginal, marginal',
      zebraOptionA: marginalZebraOption,
      zebraOptionB: marginalZebraOption,
      expected: [marginalAdjudicationReason, undervoteAdjudicationReason],
    },
    {
      description: 'marginal, unmarked',
      zebraOptionA: marginalZebraOption,
      zebraOptionB: unmarkedZebraOption,
      expected: [marginalAdjudicationReason, undervoteAdjudicationReason],
    },
    {
      description: 'unmarked, marginal',
      zebraOptionA: unmarkedZebraOption,
      zebraOptionB: marginalZebraOption,
      expected: [marginalAdjudicationReason, undervoteAdjudicationReason],
    },
    {
      description: 'unmarked, unmarked',
      zebraOptionA: unmarkedZebraOption,
      zebraOptionB: unmarkedZebraOption,
      expected: [undervoteAdjudicationReason],
    },
  ])(
    'handling multiple marks for same candidate - $description',
    ({ zebraOptionA, zebraOptionB, expected }) => {
      expect(
        getAllPossibleAdjudicationReasons(
          [zooCouncilMammal],
          [zebraOptionA, zebraOptionB, ...mockContestOptionScoresWithoutZebra]
        )
      ).toEqual(expected);
    }
  );
});
