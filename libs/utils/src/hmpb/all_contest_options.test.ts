import { assert, iter } from '@votingworks/basics';
import {
  arbitraryCandidateContest,
  arbitraryYesNoContest,
} from '@votingworks/test-utils';
import {
  CandidateContestOption,
  ContestOption,
  YesNoContestOption,
} from '@votingworks/types';
import fc from 'fast-check';
import { expect, expectTypeOf, test } from 'vitest';
import { allContestOptions } from './all_contest_options';

test('candidate contest with no write-ins', () => {
  fc.assert(
    fc.property(
      arbitraryCandidateContest({ allowWriteIns: fc.constant(false) }),
      (contest) => {
        const options = Array.from(allContestOptions(contest));
        expectTypeOf(options).toEqualTypeOf<CandidateContestOption[]>();
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
      (contest) => {
        const options = Array.from(allContestOptions(contest));
        expect(options).toHaveLength(contest.candidates.length + contest.seats);
        for (const [i, option] of options.entries()) {
          expectTypeOf(option).toEqualTypeOf<CandidateContestOption>();
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
    fc.property(arbitraryYesNoContest(), (contest) => {
      const options = Array.from(allContestOptions(contest));
      expectTypeOf(options).toEqualTypeOf<YesNoContestOption[]>();
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
      (contest) => {
        const options = Array.from(allContestOptions(contest));
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
