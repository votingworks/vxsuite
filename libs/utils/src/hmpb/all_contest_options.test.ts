import { assert, iter } from '@votingworks/basics';
import {
  arbitraryBallotStyle,
  arbitraryCandidateContest,
  arbitraryYesNoContest,
} from '@votingworks/test-utils';
import type {
  CandidateContest,
  CandidateContestOption,
  CandidateOrderings,
  ContestOption,
  Party,
  StraightPartyContest,
  YesNoContestOption,
} from '@votingworks/types';
import fc from 'fast-check';
import { expect, expectTypeOf, test } from 'vitest';
import {
  allStraightPartyOptions,
  allYesNoOptions,
  contestOptionName,
  uniqueCandidateOptions,
  uniqueContestOptions,
} from './all_contest_options.js';

const parties: Party[] = [
  { id: 'party-1', name: 'Party 1', fullName: 'Party One', abbrev: 'P1' },
  { id: 'party-2', name: 'Party 2', fullName: 'Party Two', abbrev: 'P2' },
];

test('candidate contest with no write-ins', () => {
  fc.assert(
    fc.property(
      arbitraryCandidateContest({ allowWriteIns: fc.constant(false) }),
      arbitraryBallotStyle(),
      (contest, ballotStyle) => {
        const orderings = ballotStyle.orderedCandidatesByContest;
        const options = [...uniqueCandidateOptions(contest, orderings)];
        expectTypeOf(options).toEqualTypeOf<CandidateContestOption[]>();
        expect(options).toHaveLength(contest.candidates.length);
        for (const [i, option] of options.entries()) {
          assert(option.type === 'candidate');
          expect(option.id).toEqual(contest.candidates[i]?.id);
          expect(option.contestId).toEqual(contest.id);
          expect(contestOptionName({ parties }, contest, option)).toEqual(
            contest.candidates[i]?.name
          );
          expect(option.isWriteIn).toEqual(false);
          expect(option.writeInIndex).toBeUndefined();
        }
      }
    )
  );
});

test('candidate contest with write-ins', () => {
  fc.assert(
    fc.property(
      arbitraryCandidateContest({ allowWriteIns: fc.constant(true) }),
      arbitraryBallotStyle(),
      (contest, ballotStyle) => {
        const orderings = ballotStyle.orderedCandidatesByContest;
        const options = [...uniqueCandidateOptions(contest, orderings)];
        expect(options).toHaveLength(contest.candidates.length + contest.seats);
        for (const [i, option] of options.entries()) {
          expectTypeOf(option).toEqualTypeOf<CandidateContestOption>();
          expect(option.id).toEqual(
            contest.candidates[i]?.id ??
              `write-in-${i - contest.candidates.length}`
          );
          expect(option.contestId).toEqual(contest.id);
          expect(contestOptionName({ parties }, contest, option)).toEqual(
            contest.candidates[i]?.name ?? 'Write-In'
          );
          expect(option.isWriteIn).toEqual(i >= contest.candidates.length);
          expect(option.writeInIndex).toEqual(
            i >= contest.candidates.length
              ? i - contest.candidates.length
              : undefined
          );
        }
      }
    )
  );
});

test('yesno contest', () => {
  fc.assert(
    fc.property(arbitraryYesNoContest(), (contest) => {
      const options = [...allYesNoOptions(contest)];
      expectTypeOf(options).toEqualTypeOf<YesNoContestOption[]>();
      expect(options).toEqual<ContestOption[]>(
        contest.options.map((option) => ({
          type: 'yesno',
          id: option.id,
          contestId: contest.id,
        }))
      );
      expect(contestOptionName({ parties }, contest, options[0]!)).toEqual(
        contest.options[0].label
      );
      expect(contestOptionName({ parties }, contest, options[1]!)).toEqual(
        contest.options[1].label
      );
    })
  );
});

test('any contest', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        arbitraryCandidateContest().filter((c) => c.candidates.length > 0),
        arbitraryYesNoContest()
      ),
      arbitraryBallotStyle(),
      (contest, ballotStyle) => {
        const candidateOrderings = ballotStyle.orderedCandidatesByContest;
        const options = [...uniqueContestOptions(contest, candidateOrderings)];
        expectTypeOf(options).toEqualTypeOf<ContestOption[]>();
        expectTypeOf(options).not.toEqualTypeOf<YesNoContestOption[]>();
        expectTypeOf(options).not.toEqualTypeOf<CandidateContestOption[]>();
        const types = new Set(options.map(({ type }) => type));
        expect(types.size).toEqual(1);
        expect(iter(types).first()).toMatch(/^candidate|yesno$/);
      }
    )
  );
});

test('candidate contest with ballot style ordering', () => {
  // Create a contest with candidates A, B, C
  const contest: CandidateContest = {
    type: 'candidate',
    id: 'contest-1',
    title: 'Test Contest',
    districtId: 'district-1',
    seats: 1,
    allowWriteIns: false,
    candidates: [
      { id: 'candidate-a', name: 'Alice', partyIds: [] },
      { id: 'candidate-b', name: 'Bob', partyIds: [] },
      { id: 'candidate-c', name: 'Charlie', partyIds: [] },
    ],
  };

  const options = [
    ...uniqueCandidateOptions(contest, {
      'contest-1': [
        { id: 'candidate-c' },
        { id: 'candidate-a' },
        { id: 'candidate-b' },
      ],
    }),
  ];

  // Verify the order matches the ballot style ordering
  expect(options).toHaveLength(3);
  expect(options[0]?.id).toEqual('candidate-c');
  expect(contestOptionName({ parties }, contest, options[0]!)).toEqual(
    'Charlie'
  );
  expect(options[1]?.id).toEqual('candidate-a');
  expect(contestOptionName({ parties }, contest, options[1]!)).toEqual('Alice');
  expect(options[2]?.id).toEqual('candidate-b');
  expect(contestOptionName({ parties }, contest, options[2]!)).toEqual('Bob');
});

test('candidate contest with multi-endorsed candidates are deduplicated', () => {
  // Create a contest with a multi-endorsed candidate
  const contest: CandidateContest = {
    type: 'candidate',
    id: 'contest-1',
    title: 'Test Contest',
    districtId: 'district-1',
    seats: 1,
    allowWriteIns: false,
    candidates: [
      { id: 'candidate-a', name: 'Alice', partyIds: ['party-1', 'party-2'] },
      { id: 'candidate-b', name: 'Bob', partyIds: ['party-3'] },
    ],
  };

  const options = [
    ...uniqueCandidateOptions(contest, {
      'contest-1': [
        { id: 'candidate-a', partyIds: ['party-1'] },
        { id: 'candidate-b' },
        { id: 'candidate-a', partyIds: ['party-2'] },
      ],
    }),
  ];

  // Verify multi-endorsed candidate appears only once (deduplicated by id)
  expect(options).toHaveLength(2);
  expect(options[0]?.id).toEqual('candidate-a');
  expect(contestOptionName({ parties }, contest, options[0]!)).toEqual('Alice');
  expect(options[1]?.id).toEqual('candidate-b');
  expect(contestOptionName({ parties }, contest, options[1]!)).toEqual('Bob');
});

test('straight party contest', () => {
  const contest: StraightPartyContest = {
    type: 'straight-party',
    id: 'contest-1',
    title: 'Straight Party Ticket',
    districtId: 'district-1',
    optionIds: ['party-1', 'party-2'],
  };

  const options = [...allStraightPartyOptions(contest)];

  expect(options).toEqual([
    {
      type: 'straight-party',
      id: 'party-1',
      contestId: 'contest-1',
    },
    {
      type: 'straight-party',
      id: 'party-2',
      contestId: 'contest-1',
    },
  ]);
  expect(contestOptionName({ parties }, contest, options[0]!)).toEqual(
    'Party One'
  );
  expect(contestOptionName({ parties }, contest, options[1]!)).toEqual(
    'Party Two'
  );

  const orderings: CandidateOrderings = {
    // Should be unused/have no effect on straight-party ordering:
    'contest-1': [{ id: 'party-2' }, { id: 'party-1' }],
  };
  expect([...uniqueContestOptions(contest, orderings)]).toEqual(options);
});
