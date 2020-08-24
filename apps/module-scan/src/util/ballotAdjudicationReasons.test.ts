import {
  AdjudicationReason,
  CandidateContest,
  YesNoContest,
} from '@votingworks/ballot-encoder'
import election from '../../test/fixtures/2020-choctaw/election'
import { MarkStatus } from '../types/ballot-review'
import ballotAdjudicationReasons, {
  adjudicationReasonDescription,
} from './ballotAdjudicationReasons'

const president = election.contests.find(
  ({ id }) => id === '1'
) as CandidateContest
const senator = election.contests.find(
  ({ id }) => id === '2'
) as CandidateContest
const [presidentialCandidate1, presidentialCandidate2] = president.candidates
const [
  senatorialCandidate1,
  senatorialCandidate2,
  senatorialCandidate3,
] = senator.candidates
const initiative65 = election.contests.find(
  ({ id }) => id === 'initiative-65'
) as YesNoContest

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
      "Contest '1' has a marginal mark for option '2'.",
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
      "Contest '1' is undervoted, expected 1 but got none.",
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
      "Contest '1' is overvoted, expected 1 but got 2: '1', '2'.",
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
      "Contest '1' has a marginal mark for option '1'.",
      "Contest '1' is undervoted, expected 1 but got none.",
      "Contest '2' has a write-in.",
      "Contest '2' is overvoted, expected 1 but got 4: '21', '22', '23', '__write-in-0'.",
    ]
  `)
})

test('yesno contest overvotes', () => {
  const reasons = [
    ...ballotAdjudicationReasons([initiative65], {
      optionMarkStatus: () => MarkStatus.Marked,
    }),
  ]

  expect(reasons).toEqual([
    {
      type: AdjudicationReason.Overvote,
      contestId: initiative65.id,
      optionIds: ['yes', 'no'],
      expected: 1,
    },
  ])

  expect(reasons.map(adjudicationReasonDescription)).toMatchInlineSnapshot(`
    Array [
      "Contest 'initiative-65' is overvoted, expected 1 but got 2: 'yes', 'no'.",
    ]
  `)
})

test('a ballot with a just a write-in', () => {
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
