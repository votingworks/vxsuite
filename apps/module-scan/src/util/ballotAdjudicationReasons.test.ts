import {
  AdjudicationReason,
  CandidateContest,
  MsEitherNeitherContest,
  YesNoContest,
} from '@votingworks/types'
import * as choctawMockGeneral2020 from '../../test/fixtures/choctaw-mock-general-election-2020'
import { MarkStatus } from '../types/ballot-review'
import ballotAdjudicationReasons, {
  adjudicationReasonDescription,
} from './ballotAdjudicationReasons'

const president = choctawMockGeneral2020.election.contests.find(
  ({ id }) => id === '775020876'
) as CandidateContest
const senator = choctawMockGeneral2020.election.contests.find(
  ({ id }) => id === '775020877'
) as CandidateContest
const [presidentialCandidate1, presidentialCandidate2] = president.candidates
const [
  senatorialCandidate1,
  senatorialCandidate2,
  senatorialCandidate3,
] = senator.candidates
const flagInitiative = choctawMockGeneral2020.election.contests.find(
  ({ id }) => id === '750000018'
) as YesNoContest
const eitherNeitherQuestion = choctawMockGeneral2020.election.contests.find(
  ({ id }) => id === '750000015-750000016-either-neither'
) as MsEitherNeitherContest

test('an uninterpretable ballot', () => {
  expect([
    ...ballotAdjudicationReasons(undefined, {
      optionMarkStatus: () => MarkStatus.Unmarked,
    }),
  ]).toEqual([{ type: AdjudicationReason.UninterpretableBallot }])
})

test('a ballot with no adjudication reasons', () => {
  expect([
    ...ballotAdjudicationReasons([president], {
      optionMarkStatus: (contestId, optionId) =>
        // mark the expected number of options
        contestId === president.id && optionId === presidentialCandidate1.id
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ]).toEqual([])
})

test('a ballot with marginal marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([president], {
      optionMarkStatus: (contestId, optionId) => {
        if (contestId === president.id) {
          switch (optionId) {
            case presidentialCandidate1.id:
              return MarkStatus.Marked
            case presidentialCandidate2.id:
              return MarkStatus.Marginal
          }
        }

        return MarkStatus.Unmarked
      },
    }),
  ]

  expect(reasons).toEqual([
    {
      type: AdjudicationReason.MarginalMark,
      contestId: president.id,
      optionId: presidentialCandidate2.id,
    },
  ])

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest '775020876' has a marginal mark for option '775031987'.",
    ]
  `)
})

test('a ballot with no marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([president], {
      optionMarkStatus: () => MarkStatus.Unmarked,
    }),
  ]

  expect(reasons).toEqual([
    {
      type: AdjudicationReason.Undervote,
      contestId: president.id,
      optionIds: [],
      expected: 1,
    },
    {
      type: AdjudicationReason.BlankBallot,
    },
  ])

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest '775020876' is undervoted, expected 1 but got none.",
      "Ballot has no votes.",
    ]
  `)
})

test('a ballot page with no contests', () => {
  const reasons = [
    ...ballotAdjudicationReasons([], {
      optionMarkStatus: () => MarkStatus.Unmarked,
    }),
  ]

  // Notably, there is no BlankBallot adjudication reason.
  expect(reasons).toEqual([])
})

test('a ballot with too many marks', () => {
  const reasons = [
    ...ballotAdjudicationReasons([president], {
      optionMarkStatus: (contestId, optionId) => {
        if (contestId === president.id) {
          switch (optionId) {
            case presidentialCandidate1.id:
            case presidentialCandidate2.id:
              return MarkStatus.Marked
          }
        }

        return MarkStatus.Unmarked
      },
    }),
  ]

  expect(reasons).toEqual([
    {
      type: AdjudicationReason.Overvote,
      contestId: president.id,
      optionIds: [presidentialCandidate1.id, presidentialCandidate2.id],
      expected: 1,
    },
  ])

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest '775020876' is overvoted, expected 1 but got 2: '775031988', '775031987'.",
    ]
  `)
})

test('multiple contests with issues', () => {
  const reasons = [
    ...ballotAdjudicationReasons([president, senator], {
      optionMarkStatus: (contestId, optionId) =>
        // first presidential candidate marginally marked
        contestId === president.id && optionId === presidentialCandidate1.id
          ? MarkStatus.Marginal
          : // all senatorial options marked
          contestId === senator.id
          ? MarkStatus.Marked
          : // everything else unmarked
            MarkStatus.Unmarked,
    }),
  ]

  expect(reasons).toEqual([
    {
      type: AdjudicationReason.MarginalMark,
      contestId: president.id,
      optionId: presidentialCandidate1.id,
    },
    {
      type: AdjudicationReason.Undervote,
      contestId: president.id,
      optionIds: [],
      expected: 1,
    },
    {
      type: AdjudicationReason.WriteIn,
      contestId: senator.id,
      optionId: '__write-in-0',
    },
    {
      type: AdjudicationReason.Overvote,
      contestId: senator.id,
      optionIds: [
        senatorialCandidate1.id,
        senatorialCandidate2.id,
        senatorialCandidate3.id,
        '__write-in-0',
      ],
      expected: 1,
    },
  ])

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest '775020876' has a marginal mark for option '775031988'.",
      "Contest '775020876' is undervoted, expected 1 but got none.",
      "Contest '775020877' has a write-in.",
      "Contest '775020877' is overvoted, expected 1 but got 4: '775031985', '775031986', '775031990', '__write-in-0'.",
    ]
  `)
})

test('yesno contest overvotes', () => {
  const reasons = [
    ...ballotAdjudicationReasons([flagInitiative], {
      optionMarkStatus: () => MarkStatus.Marked,
    }),
  ]

  expect(reasons).toEqual([
    {
      type: AdjudicationReason.Overvote,
      contestId: flagInitiative.id,
      optionIds: ['yes', 'no'],
      expected: 1,
    },
  ])

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest '750000018' is overvoted, expected 1 but got 2: 'yes', 'no'.",
    ]
  `)
})

test('a ballot with just a write-in', () => {
  const reasons = [
    ...ballotAdjudicationReasons([president], {
      optionMarkStatus: (contestId, optionId) =>
        contestId === president.id && optionId === '__write-in-0'
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ]

  expect(reasons).toEqual([
    {
      type: AdjudicationReason.WriteIn,
      contestId: president.id,
      optionId: '__write-in-0',
    },
  ])
})

test('a ballot with an ms-either-neither happy path', () => {
  const reasons = [
    ...ballotAdjudicationReasons([eitherNeitherQuestion], {
      optionMarkStatus: (contestId, optionId) => {
        // either
        if (
          contestId === eitherNeitherQuestion.eitherNeitherContestId &&
          optionId === 'yes'
        ) {
          return MarkStatus.Marked
        }

        // second
        if (
          contestId === eitherNeitherQuestion.pickOneContestId &&
          optionId === 'no'
        ) {
          return MarkStatus.Marked
        }

        return MarkStatus.Unmarked
      },
    }),
  ]

  expect(reasons).toEqual([])
})

test('a ballot with an ms-either-neither either-neither overvote', () => {
  const reasons = [
    ...ballotAdjudicationReasons([eitherNeitherQuestion], {
      optionMarkStatus: (contestId) =>
        // neither & either
        contestId === eitherNeitherQuestion.eitherNeitherContestId
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ]

  expect(reasons).toContainEqual({
    type: AdjudicationReason.Overvote,
    contestId: eitherNeitherQuestion.eitherNeitherContestId,
    optionIds: ['yes', 'no'],
    expected: 1,
  })
})

test('a ballot with an ms-either-neither pick-one overvote', () => {
  const reasons = [
    ...ballotAdjudicationReasons([eitherNeitherQuestion], {
      optionMarkStatus: (contestId) =>
        // first & second
        contestId === eitherNeitherQuestion.pickOneContestId
          ? MarkStatus.Marked
          : MarkStatus.Unmarked,
    }),
  ]

  expect(reasons).toContainEqual({
    type: AdjudicationReason.Overvote,
    contestId: eitherNeitherQuestion.pickOneContestId,
    optionIds: ['yes', 'no'],
    expected: 1,
  })
})
