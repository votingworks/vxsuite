import { expect, test } from 'vitest';
import {
  arbitraryCandidateContest,
  arbitraryCandidateId,
  arbitraryYesNoContest,
} from '@votingworks/test-utils';
import { ContestOption } from '@votingworks/types';
import fc from 'fast-check';
import { assert } from '@votingworks/basics';
import { allContestOptions } from './all_contest_options';

test('candidate contest with no write-ins', () => {
  fc.assert(
    fc.property(
      arbitraryCandidateContest({ allowWriteIns: fc.constant(false) }),
      (contest) => {
        const options = Array.from(allContestOptions(contest));
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
          assert(option.type === 'candidate');
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

test('candidate contest with provided write-in IDs', () => {
  fc.assert(
    fc.property(
      // Make a contest…
      arbitraryCandidateContest({
        allowWriteIns: fc.constant(true),
      }).chain((contest) =>
        // …and come up with IDs for the write-ins.
        fc.tuple(
          fc.array(arbitraryCandidateId(), {
            minLength: contest.seats,
            maxLength: contest.seats,
          }),
          fc.constant(contest)
        )
      ),
      ([writeInOptionIds, contest]) => {
        const options = Array.from(
          allContestOptions(contest, writeInOptionIds)
        );
        expect(options).toHaveLength(
          contest.candidates.length + writeInOptionIds.length
        );
        for (const [i, option] of options.entries()) {
          assert(option.type === 'candidate');
          expect(option.id).toEqual(
            contest.candidates[i]?.id ??
              writeInOptionIds[i - contest.candidates.length]
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
      expect(Array.from(allContestOptions(contest))).toEqual<ContestOption[]>([
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
