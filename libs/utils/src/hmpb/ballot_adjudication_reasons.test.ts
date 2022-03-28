import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  CandidateContest,
  MarkStatus,
  MsEitherNeitherContest,
  UnmarkedWriteInAdjudicationReasonInfo,
  WriteInAdjudicationReasonInfo,
  YesNoContest,
} from '@votingworks/types';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  ballotAdjudicationReasons,
  adjudicationReasonDescription,
} from './ballot_adjudication_reasons';
import { typedAs } from '../types';
import { assert } from '../assert';

const bestAnimalMammal =
  electionMinimalExhaustiveSampleDefinition.election.contests.find(
    ({ id }) => id === 'best-animal-mammal'
  ) as CandidateContest;
const zooCouncilMammal =
  electionMinimalExhaustiveSampleDefinition.election.contests.find(
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
const ballotMeasure3 =
  electionMinimalExhaustiveSampleDefinition.election.contests.find(
    ({ id }) => id === 'fishing'
  ) as YesNoContest;
const eitherNeitherQuestion =
  electionMinimalExhaustiveSampleDefinition.election.contests.find(
    ({ id }) => id === 'new-zoo-either-neither'
  ) as MsEitherNeitherContest;

test('an uninterpretable ballot', () => {
  expect([
    ...ballotAdjudicationReasons(undefined, {
      optionMarkStatus: () => MarkStatus.Unmarked,
    }),
  ]).toEqual(
    typedAs<AdjudicationReasonInfo[]>([
      { type: AdjudicationReason.UninterpretableBallot },
    ])
  );

  expect(
    adjudicationReasonDescription({
      type: AdjudicationReason.UninterpretableBallot,
    })
  ).toEqual(
    'The ballot could not be interpreted at all, possibly due to a bad scan.'
  );
});

test('a ballot with no adjudication reasons', () => {
  expect([
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionMarkStatus: (contestId, optionId) =>
        // mark the expected number of options
        contestId === bestAnimalMammal.id &&
        optionId === bestAnimalMammalCandidate1.id
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ]).toEqual([]);
});

test('a ballot with marginal marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionMarkStatus: (contestId, optionId) => {
        if (contestId === bestAnimalMammal.id) {
          // eslint-disable-next-line default-case
          switch (optionId) {
            case bestAnimalMammalCandidate1.id:
              return MarkStatus.Marked;
            case bestAnimalMammalCandidate2.id:
              return MarkStatus.Marginal;
          }
        }

        return MarkStatus.Unmarked;
      },
    }),
  ];

  expect(reasons).toEqual(
    typedAs<AdjudicationReasonInfo[]>([
      {
        type: AdjudicationReason.MarginalMark,
        contestId: bestAnimalMammal.id,
        optionId: bestAnimalMammalCandidate2.id,
        optionIndex: 1,
      },
    ])
  );

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest 'best-animal-mammal' has a marginal mark for option 'otter'.",
    ]
  `);
});

test('a ballot with no marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionMarkStatus: () => MarkStatus.Unmarked,
    }),
  ];

  expect(reasons).toEqual(
    typedAs<AdjudicationReasonInfo[]>([
      {
        type: AdjudicationReason.Undervote,
        contestId: bestAnimalMammal.id,
        optionIds: [],
        optionIndexes: [],
        expected: 1,
      },
      {
        type: AdjudicationReason.BlankBallot,
      },
    ])
  );

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest 'best-animal-mammal' is undervoted, expected 1 but got none.",
      "Ballot has no votes.",
    ]
  `);
});

test('a ballot page with no contests', () => {
  const reasons = [
    ...ballotAdjudicationReasons([], {
      optionMarkStatus: () => MarkStatus.Unmarked,
    }),
  ];

  // Notably, there is no BlankBallot adjudication reason.
  expect(reasons).toEqual([]);
});

test('a ballot with too many marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionMarkStatus: (contestId, optionId) => {
        if (contestId === bestAnimalMammal.id) {
          // eslint-disable-next-line default-case
          switch (optionId) {
            case bestAnimalMammalCandidate1.id:
            case bestAnimalMammalCandidate2.id:
              return MarkStatus.Marked;
          }
        }

        return MarkStatus.Unmarked;
      },
    }),
  ];

  expect(reasons).toEqual(
    typedAs<AdjudicationReasonInfo[]>([
      {
        type: AdjudicationReason.Overvote,
        contestId: bestAnimalMammal.id,
        optionIds: [
          bestAnimalMammalCandidate1.id,
          bestAnimalMammalCandidate2.id,
        ],
        optionIndexes: [0, 1],
        expected: 1,
      },
    ])
  );

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest 'best-animal-mammal' is overvoted, expected 1 but got 2: 'horse', 'otter'.",
    ]
  `);
});

test('multiple contests with issues', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal, zooCouncilMammal], {
      optionMarkStatus: (contestId, optionId) =>
        // first "best animal" candidate marginally marked
        contestId === bestAnimalMammal.id &&
        optionId === bestAnimalMammalCandidate1.id
          ? MarkStatus.Marginal
          : // all "zoo council" options marked
          contestId === zooCouncilMammal.id
          ? MarkStatus.Marked
          : // everything else unmarked
            MarkStatus.Unmarked,
    }),
  ];

  expect(reasons).toEqual(
    typedAs<AdjudicationReasonInfo[]>([
      {
        type: AdjudicationReason.MarginalMark,
        contestId: bestAnimalMammal.id,
        optionId: bestAnimalMammalCandidate1.id,
        optionIndex: 0,
      },
      {
        type: AdjudicationReason.Undervote,
        contestId: bestAnimalMammal.id,
        optionIds: [],
        expected: 1,
        optionIndexes: [],
      },
      {
        type: AdjudicationReason.WriteIn,
        contestId: zooCouncilMammal.id,
        optionId: '__write-in-0',
        optionIndex: 4,
      },
      {
        type: AdjudicationReason.WriteIn,
        contestId: zooCouncilMammal.id,
        optionId: '__write-in-1',
        optionIndex: 5,
      },
      {
        type: AdjudicationReason.WriteIn,
        contestId: zooCouncilMammal.id,
        optionId: '__write-in-2',
        optionIndex: 6,
      },
      {
        type: AdjudicationReason.Overvote,
        contestId: zooCouncilMammal.id,
        optionIds: [
          zooCouncilMammalCandidate1.id,
          zooCouncilMammalCandidate2.id,
          zooCouncilMammalCandidate3.id,
          zooCouncilMammalCandidate4.id,
          '__write-in-0',
          '__write-in-1',
          '__write-in-2',
        ],
        optionIndexes: [0, 1, 2, 3, 4, 5, 6],
        expected: 3,
      },
    ])
  );

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest 'best-animal-mammal' has a marginal mark for option 'horse'.",
      "Contest 'best-animal-mammal' is undervoted, expected 1 but got none.",
      "Contest 'zoo-council-mammal' has a write-in.",
      "Contest 'zoo-council-mammal' has a write-in.",
      "Contest 'zoo-council-mammal' has a write-in.",
      "Contest 'zoo-council-mammal' is overvoted, expected 3 but got 7: 'zebra', 'lion', 'kangaroo', 'elephant', '__write-in-0', '__write-in-1', '__write-in-2'.",
    ]
  `);
});

test('yesno contest overvotes', () => {
  const reasons = [
    ...ballotAdjudicationReasons([ballotMeasure3], {
      optionMarkStatus: () => MarkStatus.Marked,
    }),
  ];

  expect(reasons).toEqual(
    typedAs<AdjudicationReasonInfo[]>([
      {
        type: AdjudicationReason.Overvote,
        contestId: ballotMeasure3.id,
        optionIds: ['yes', 'no'],
        optionIndexes: [0, 1],
        expected: 1,
      },
    ])
  );

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest 'fishing' is overvoted, expected 1 but got 2: 'yes', 'no'.",
    ]
  `);
});

test('a ballot with just a write-in', () => {
  const reasons = [
    ...ballotAdjudicationReasons([zooCouncilMammal], {
      optionMarkStatus: (contestId, optionId) =>
        contestId === zooCouncilMammal.id && optionId === '__write-in-0'
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ];

  expect(reasons).toContainEqual(
    typedAs<WriteInAdjudicationReasonInfo>({
      type: AdjudicationReason.WriteIn,
      contestId: zooCouncilMammal.id,
      optionId: '__write-in-0',
      optionIndex: 4,
    })
  );
});

test('a ballot with just an unmarked write-in', () => {
  const reasons = [
    ...ballotAdjudicationReasons([zooCouncilMammal], {
      optionMarkStatus: (contestId, optionId) =>
        contestId === zooCouncilMammal.id && optionId === '__write-in-0'
          ? MarkStatus.UnmarkedWriteIn
          : MarkStatus.Unmarked,
    }),
  ];

  const expectedReason: UnmarkedWriteInAdjudicationReasonInfo = {
    type: AdjudicationReason.UnmarkedWriteIn,
    contestId: zooCouncilMammal.id,
    optionId: '__write-in-0',
    optionIndex: 4,
  };

  expect(reasons).toContainEqual(expectedReason);
  expect(adjudicationReasonDescription(expectedReason)).toMatchInlineSnapshot(
    `"Contest 'zoo-council-mammal' has an unmarked write-in."`
  );
});

test('a ballot with an ms-either-neither happy path', () => {
  const reasons = [
    ...ballotAdjudicationReasons([eitherNeitherQuestion], {
      optionMarkStatus: (contestId, optionId) => {
        // either
        if (
          contestId === eitherNeitherQuestion.eitherNeitherContestId &&
          optionId === 'yes'
        ) {
          return MarkStatus.Marked;
        }

        // second
        if (
          contestId === eitherNeitherQuestion.pickOneContestId &&
          optionId === 'no'
        ) {
          return MarkStatus.Marked;
        }

        return MarkStatus.Unmarked;
      },
    }),
  ];

  expect(reasons).toEqual([]);
});

test('a ballot with an ms-either-neither either-neither overvote', () => {
  const reasons = [
    ...ballotAdjudicationReasons([eitherNeitherQuestion], {
      optionMarkStatus: (contestId) =>
        // neither & either
        contestId === eitherNeitherQuestion.eitherNeitherContestId
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ];

  expect(reasons).toContainEqual(
    typedAs<AdjudicationReasonInfo>({
      type: AdjudicationReason.Overvote,
      contestId: eitherNeitherQuestion.eitherNeitherContestId,
      optionIds: ['yes', 'no'],
      optionIndexes: [0, 1],
      expected: 1,
    })
  );
});

test('a ballot with an ms-either-neither pick-one overvote', () => {
  const reasons = [
    ...ballotAdjudicationReasons([eitherNeitherQuestion], {
      optionMarkStatus: (contestId) =>
        // first & second
        contestId === eitherNeitherQuestion.pickOneContestId
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ];

  expect(reasons).toContainEqual(
    typedAs<AdjudicationReasonInfo>({
      type: AdjudicationReason.Overvote,
      contestId: eitherNeitherQuestion.pickOneContestId,
      optionIds: ['yes', 'no'],
      optionIndexes: [2, 3],
      expected: 1,
    })
  );
});
