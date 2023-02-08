import { assert, assertDefined, find } from '@votingworks/basics';
import {
  AnyContest,
  Contest,
  ContestId,
  Contests,
  YesNoOption,
  getContestDistrictName as getContestDistrictNameBase,
  Election,
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
  readonly pickOneContestId: ContestId;
  readonly description: string;
  readonly eitherNeitherLabel: string;
  readonly pickOneLabel: string;
  readonly eitherOption: YesNoOption;
  readonly neitherOption: YesNoOption;
  readonly firstOption: YesNoOption;
  readonly secondOption: YesNoOption;
}

/**
 * A list of contests including merged MS either-neither contests.
 */
export type ContestsWithMsEitherNeither = ReadonlyArray<
  AnyContest | MsEitherNeitherContest
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
  contests: Contests | ContestsWithMsEitherNeither
): ContestsWithMsEitherNeither {
  const eitherNeitherContest = contests.find(
    (contest) =>
      contest.type === 'yesno' &&
      contest.yesOption?.label.startsWith('FOR APPROVAL OF EITHER') &&
      /* istanbul ignore next */
      contest.noOption?.label.startsWith('AGAINST BOTH')
  );
  if (!eitherNeitherContest) {
    return contests;
  }
  assert(eitherNeitherContest.type === 'yesno');
  assertDefined(eitherNeitherContest.yesOption);
  assertDefined(eitherNeitherContest.noOption);
  const pickOneContest = contests.find(
    (contest) =>
      contest.type === 'yesno' &&
      /* istanbul ignore next */
      contest.yesOption?.label.startsWith('FOR') &&
      /* istanbul ignore next */
      contest.noOption?.label.startsWith('FOR') &&
      contest.description === eitherNeitherContest.description
  );
  assert(pickOneContest);
  assert(pickOneContest.type === 'yesno');

  const mergedContest: MsEitherNeitherContest = {
    type: 'ms-either-neither',
    id: `${eitherNeitherContest.id}-${pickOneContest.id}-either-neither`,
    districtId: eitherNeitherContest.districtId,
    title: eitherNeitherContest.title,
    eitherNeitherContestId: eitherNeitherContest.id,
    pickOneContestId: pickOneContest.id,
    description: eitherNeitherContest.description,
    eitherNeitherLabel: 'VOTE FOR APPROVAL OF EITHER, OR AGAINST BOTH',
    pickOneLabel: 'AND VOTE FOR ONE',
    eitherOption: assertDefined(eitherNeitherContest.yesOption),
    neitherOption: assertDefined(eitherNeitherContest.noOption),
    firstOption: assertDefined(pickOneContest.yesOption),
    secondOption: assertDefined(pickOneContest.noOption),
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
  contest: AnyContest | MsEitherNeitherContest
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
