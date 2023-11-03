import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  CandidateContest,
  MarkStatus,
  WriteInAreaStatus,
  YesNoContest,
} from '@votingworks/types';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import {
  ballotAdjudicationReasons,
  adjudicationReasonDescription,
} from './ballot_adjudication_reasons';

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

function optionStatus(
  markStatus: MarkStatus,
  writeInAreaStatus?: WriteInAreaStatus
): {
  markStatus: MarkStatus;
  writeInAreaStatus: WriteInAreaStatus;
} {
  return {
    markStatus,
    writeInAreaStatus: writeInAreaStatus ?? WriteInAreaStatus.Ignored,
  };
}

test('a ballot with no adjudication reasons', () => {
  expect([
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionStatus: (option) =>
        // mark the expected number of options
        option.contestId === bestAnimalMammal.id &&
        option.id === bestAnimalMammalCandidate1.id
          ? optionStatus(MarkStatus.Marked)
          : optionStatus(MarkStatus.Unmarked),
    }),
  ]).toEqual([]);
});

test('a ballot with marginal marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionStatus: (option) => {
        if (option.contestId === bestAnimalMammal.id) {
          switch (option.id) {
            case bestAnimalMammalCandidate1.id:
              return optionStatus(MarkStatus.Marked);
            case bestAnimalMammalCandidate2.id:
              return optionStatus(MarkStatus.Marginal);
            default:
              break;
          }
        }

        return optionStatus(MarkStatus.Unmarked);
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
    [
      "Contest 'best-animal-mammal' has a marginal mark for option 'otter'.",
    ]
  `);
});

test('a ballot with no marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionStatus: () => optionStatus(MarkStatus.Unmarked),
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
    [
      "Contest 'best-animal-mammal' is undervoted, expected 1 but got none.",
      "Ballot has no votes.",
    ]
  `);
});

test('a ballot page with no contests', () => {
  const reasons = [
    ...ballotAdjudicationReasons([], {
      optionStatus: () => optionStatus(MarkStatus.Unmarked),
    }),
  ];

  // Notably, there is no BlankBallot adjudication reason.
  expect(reasons).toEqual([]);
});

test('a ballot with too many marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal], {
      optionStatus: (option) => {
        if (option.contestId === bestAnimalMammal.id) {
          switch (option.id) {
            case bestAnimalMammalCandidate1.id:
            case bestAnimalMammalCandidate2.id:
              return optionStatus(MarkStatus.Marked);
            default:
              break;
          }
        }

        return optionStatus(MarkStatus.Unmarked);
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
    [
      "Contest 'best-animal-mammal' is overvoted, expected 1 but got 2: 'horse', 'otter'.",
    ]
  `);
});

test('multiple contests with issues', () => {
  const reasons = [
    ...ballotAdjudicationReasons([bestAnimalMammal, zooCouncilMammal], {
      optionStatus: (option) =>
        // first "best animal" candidate marginally marked
        option.contestId === bestAnimalMammal.id &&
        option.id === bestAnimalMammalCandidate1.id
          ? optionStatus(MarkStatus.Marginal)
          : // all "zoo council" options marked
          option.contestId === zooCouncilMammal.id
          ? optionStatus(MarkStatus.Marked)
          : // everything else unmarked
            optionStatus(MarkStatus.Unmarked),
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
        type: AdjudicationReason.Overvote,
        contestId: zooCouncilMammal.id,
        optionIds: [
          zooCouncilMammalCandidate1.id,
          zooCouncilMammalCandidate2.id,
          zooCouncilMammalCandidate3.id,
          zooCouncilMammalCandidate4.id,
          'write-in-0',
          'write-in-1',
          'write-in-2',
        ],
        optionIndexes: [0, 1, 2, 3, 4, 5, 6],
        expected: 3,
      },
    ])
  );

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    [
      "Contest 'best-animal-mammal' has a marginal mark for option 'horse'.",
      "Contest 'best-animal-mammal' is undervoted, expected 1 but got none.",
      "Contest 'zoo-council-mammal' is overvoted, expected 3 but got 7: 'zebra', 'lion', 'kangaroo', 'elephant', 'write-in-0', 'write-in-1', 'write-in-2'.",
    ]
  `);
});

test('yesno contest overvotes', () => {
  const reasons = [
    ...ballotAdjudicationReasons([ballotMeasure3], {
      optionStatus: () => optionStatus(MarkStatus.Marked),
    }),
  ];

  expect(reasons).toEqual(
    typedAs<AdjudicationReasonInfo[]>([
      {
        type: AdjudicationReason.Overvote,
        contestId: ballotMeasure3.id,
        optionIds: [ballotMeasure3.yesOption.id, ballotMeasure3.noOption.id],
        optionIndexes: [0, 1],
        expected: 1,
      },
    ])
  );

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    [
      "Contest 'fishing' is overvoted, expected 1 but got 2: 'ban-fishing', 'allow-fishing'.",
    ]
  `);
});

test('a ballot with just a write-in', () => {
  const reasons = [
    ...ballotAdjudicationReasons([zooCouncilMammal], {
      optionStatus: (option) =>
        option.contestId === zooCouncilMammal.id && option.id === 'write-in-0'
          ? optionStatus(MarkStatus.Marked)
          : optionStatus(MarkStatus.Unmarked),
    }),
  ];

  // in particular, no write-in adjudication reason anymore.
  expect(reasons).toMatchInlineSnapshot(`
    [
      {
        "contestId": "zoo-council-mammal",
        "expected": 3,
        "optionIds": [
          "write-in-0",
        ],
        "optionIndexes": [
          4,
        ],
        "type": "Undervote",
      },
    ]
  `);
});

test('an unmarked write-in is ignored in undervote cases', () => {
  const reasons = [
    ...ballotAdjudicationReasons([zooCouncilMammal], {
      optionStatus: (option) => {
        if (option.contestId === zooCouncilMammal.id) {
          switch (option.id) {
            case 'write-in-0':
              return optionStatus(
                MarkStatus.Unmarked,
                WriteInAreaStatus.Filled
              );
            default:
              return optionStatus(MarkStatus.Unmarked);
          }
        }
        return optionStatus(MarkStatus.Unmarked);
      },
    }),
  ];

  // in particular, no write-in adjudication reason anymore.
  expect(reasons).toMatchInlineSnapshot(`
    [
      {
        "contestId": "zoo-council-mammal",
        "expected": 3,
        "optionIds": [],
        "optionIndexes": [],
        "type": "Undervote",
      },
      {
        "type": "BlankBallot",
      },
    ]
  `);
});

test('an unmarked write-in can trigger the overvote reason', () => {
  const reasons = [
    ...ballotAdjudicationReasons([zooCouncilMammal], {
      optionStatus: (option) => {
        if (option.contestId === zooCouncilMammal.id) {
          switch (option.id) {
            case zooCouncilMammalCandidate1.id:
            case zooCouncilMammalCandidate2.id:
            case zooCouncilMammalCandidate3.id:
              return optionStatus(MarkStatus.Marked);
            case 'write-in-0':
              return optionStatus(
                MarkStatus.Unmarked,
                WriteInAreaStatus.Filled
              );
            default:
              return optionStatus(MarkStatus.Unmarked);
          }
        }
        return optionStatus(MarkStatus.Unmarked);
      },
    }),
  ];

  // in particular, no write-in adjudication reason anymore.
  expect(reasons).toMatchInlineSnapshot(`
    [
      {
        "contestId": "zoo-council-mammal",
        "expected": 3,
        "optionIds": [
          "zebra",
          "lion",
          "kangaroo",
          "write-in-0",
        ],
        "optionIndexes": [
          0,
          1,
          2,
          4,
        ],
        "type": "Overvote",
      },
    ]
  `);
});
