import { assert, iter } from '@votingworks/basics';
import {
  arbitraryBallotStyle,
  arbitraryCandidateContest,
  arbitraryYesNoContest,
} from '@votingworks/test-utils';
import {
  BallotStyle,
  CandidateContest,
  ContestOption,
  StraightPartyContest,
} from '@votingworks/types';
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { allContestOptions } from './all_contest_options';

test('candidate contest with no write-ins', () => {
  fc.assert(
    fc.property(
      arbitraryCandidateContest({ allowWriteIns: fc.constant(false) }),
      arbitraryBallotStyle(),
      (contest, ballotStyle) => {
        const options = Array.from(allContestOptions(contest, ballotStyle, []));
        expect(options).toHaveLength(contest.candidates.length);
        for (const [i, option] of options.entries()) {
          assert(option.type === 'candidate');
          expect(option.id).toEqual(contest.candidates[i]?.id);
          expect(option.contestId).toEqual(contest.id);
          expect(option.name).toEqual(contest.candidates[i]?.name);
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
        const options = Array.from(allContestOptions(contest, ballotStyle, []));
        expect(options).toHaveLength(contest.candidates.length + contest.seats);
        for (const [i, option] of options.entries()) {
          expect(option.id).toEqual(
            contest.candidates[i]?.id ??
              `write-in-${i - contest.candidates.length}`
          );
          expect(option.contestId).toEqual(contest.id);
          expect(option.name).toEqual(
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
    fc.property(
      arbitraryYesNoContest(),
      arbitraryBallotStyle(),
      (contest, ballotStyle) => {
        const options = Array.from(
          allContestOptions(contest, ballotStyle, [])
        );
        expect(options).toEqual<ContestOption[]>([
          {
            type: 'yesno',
            id: contest.yesOption.id,
            contestId: contest.id,
            name: contest.yesOption.label,
          },
          {
            type: 'yesno',
            id: contest.noOption.id,
            contestId: contest.id,
            name: contest.noOption.label,
          },
        ]);
      }
    )
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
        const options = Array.from(allContestOptions(contest, ballotStyle, []));
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

  // Create a ballot style that orders them as C, A, B
  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'group-1',
    precincts: ['precinct-1'],
    districts: ['district-1'],
    orderedCandidatesByContest: {
      'contest-1': [
        { id: 'candidate-c' },
        { id: 'candidate-a' },
        { id: 'candidate-b' },
      ],
    },
  };

  const options = Array.from(allContestOptions(contest, ballotStyle, []));

  // Verify the order matches the ballot style ordering
  expect(options).toHaveLength(3);
  expect(options[0]?.id).toEqual('candidate-c');
  expect(options[0]?.name).toEqual('Charlie');
  expect(options[1]?.id).toEqual('candidate-a');
  expect(options[1]?.name).toEqual('Alice');
  expect(options[2]?.id).toEqual('candidate-b');
  expect(options[2]?.name).toEqual('Bob');
});

test('straight-party contest yields one option per party', () => {
  const contest: StraightPartyContest = {
    id: 'straight-party-ticket',
    type: 'straight-party',
    title: 'Straight Party',
    districtId: 'election-wide',
  };
  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'group-1',
    precincts: ['precinct-1'],
    districts: ['district-1'],
  };
  const parties = [
    { id: 'party-1', name: 'Democrat', fullName: 'Democratic Party', abbrev: 'D' },
    { id: 'party-2', name: 'Republican', fullName: 'Republican Party', abbrev: 'R' },
  ] as const;

  const options = Array.from(allContestOptions(contest, ballotStyle, parties));
  expect(options).toEqual([
    {
      type: 'straight-party',
      id: 'party-1',
      contestId: 'straight-party-ticket',
      name: 'Democratic Party',
    },
    {
      type: 'straight-party',
      id: 'party-2',
      contestId: 'straight-party-ticket',
      name: 'Republican Party',
    },
  ]);
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

  // Create a ballot style that lists the multi-endorsed candidate twice
  // (once for each party endorsement)
  const ballotStyle: BallotStyle = {
    id: 'ballot-style-1',
    groupId: 'group-1',
    precincts: ['precinct-1'],
    districts: ['district-1'],
    orderedCandidatesByContest: {
      'contest-1': [
        { id: 'candidate-a', partyIds: ['party-1'] },
        { id: 'candidate-b' },
        { id: 'candidate-a', partyIds: ['party-2'] },
      ],
    },
  };

  const options = Array.from(allContestOptions(contest, ballotStyle, []));

  // Verify multi-endorsed candidate appears only once (deduplicated by id)
  expect(options).toHaveLength(2);
  expect(options[0]?.id).toEqual('candidate-a');
  expect(options[0]?.name).toEqual('Alice');
  expect(options[1]?.id).toEqual('candidate-b');
  expect(options[1]?.name).toEqual('Bob');
});
