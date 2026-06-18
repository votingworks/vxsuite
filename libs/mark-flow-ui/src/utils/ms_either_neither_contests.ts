import { assert, assertDefined, find } from '@votingworks/basics';
import {
  Contest,
  ContestId,
  BallotMeasureOption,
  getContestDistrictName as getContestDistrictNameBase,
  Election,
  BallotMeasureContest,
} from '@votingworks/types';

/**
 * Special case to support MS either-neither contests, which are represented in
 * the election definition as two separate ballot measure contests. In VxMark,
 * we want to show a combined UI for these contests to make them easy to
 * understand, so we combine the two contests into one "contest" data structure.
 */
export interface MsEitherNeitherContest extends Omit<Contest, 'type'> {
  readonly type: 'ms-either-neither';
  readonly eitherNeitherContestId: ContestId;
  readonly eitherNeitherContest: BallotMeasureContest;
  readonly pickOneContestId: ContestId;
  readonly pickOneContest: BallotMeasureContest;
  readonly description: string;
  readonly eitherOption: BallotMeasureOption;
  readonly neitherOption: BallotMeasureOption;
  readonly firstOption: BallotMeasureOption;
  readonly secondOption: BallotMeasureOption;
}

/**
 * A list of contests including merged MS either-neither contests.
 */
export type ContestsWithMsEitherNeither = ReadonlyArray<
  Contest | MsEitherNeitherContest
>;

function insertAtIndex<T>(array: T[], index: number, item: T): T[] {
  return [...array.slice(0, index), item, ...array.slice(index)];
}

/**
 * Merges any pairs of ballot measure contests that represent an MS
 * either-neither contest into our custom ms-either-neither contest data
 * structure.
 */
export function mergeMsEitherNeitherContests(
  contests: readonly Contest[] | ContestsWithMsEitherNeither
): ContestsWithMsEitherNeither {
  const eitherNeitherContest = contests.find(
    (contest) =>
      contest.type === 'measure' &&
      contest.options[0].label.startsWith('FOR APPROVAL OF EITHER') &&
      /* istanbul ignore next */
      contest.options[1].label.startsWith('AGAINST BOTH')
  );
  if (!eitherNeitherContest) {
    return contests;
  }
  assert(eitherNeitherContest.type === 'measure');
  assertDefined(eitherNeitherContest.options[0]);
  assertDefined(eitherNeitherContest.options[1]);
  const pickOneContest = contests.find(
    (contest) =>
      contest.type === 'measure' &&
      /* istanbul ignore next */
      contest.options[0].label.startsWith('FOR') &&
      /* istanbul ignore next */
      contest.options[1].label.startsWith('FOR') &&
      contest.description === eitherNeitherContest.description
  );
  assert(pickOneContest);
  assert(pickOneContest.type === 'measure');

  const mergedContest: MsEitherNeitherContest = {
    type: 'ms-either-neither',
    id: `${eitherNeitherContest.id}-${pickOneContest.id}-either-neither`,
    districtId: eitherNeitherContest.districtId,
    title: eitherNeitherContest.title,
    eitherNeitherContestId: eitherNeitherContest.id,
    eitherNeitherContest,
    pickOneContestId: pickOneContest.id,
    pickOneContest,
    description: eitherNeitherContest.description,
    eitherOption: assertDefined(eitherNeitherContest.options[0]),
    neitherOption: assertDefined(eitherNeitherContest.options[1]),
    firstOption: assertDefined(pickOneContest.options[0]),
    secondOption: assertDefined(pickOneContest.options[1]),
  };

  const contestsWithoutEitherNeither = contests.filter(
    (contest) =>
      contest.id !== eitherNeitherContest.id && contest.id !== pickOneContest.id
  );
  const mergedContests: ContestsWithMsEitherNeither = insertAtIndex(
    contestsWithoutEitherNeither,
    contests.indexOf(eitherNeitherContest),
    mergedContest
  );

  return mergeMsEitherNeitherContests(mergedContests);
}

/**
 * Returns the district name for a contest, including MS either-neither
 * contests.
 */
export function getContestDistrictName(
  election: Election,
  contest: Contest | MsEitherNeitherContest
): string {
  if (contest.type === 'ms-either-neither') {
    const district = find(
      election.districts,
      (d) => d.id === contest.districtId
    );
    return district.name;
  }
  return getContestDistrictNameBase(election, contest);
}
