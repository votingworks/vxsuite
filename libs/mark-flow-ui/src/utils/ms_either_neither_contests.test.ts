import { expect, test } from 'vitest';
import { assert, find } from '@votingworks/basics';
import {
  electionGeneral,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures';
import {
  getContestDistrictName,
  mergeMsEitherNeitherContests,
} from './ms_either_neither_contests';

test('mergeMsEitherNeitherContests detects pairs of ballot measures and merges them', () => {
  const { contests } = electionWithMsEitherNeither;
  const eitherNeitherContest = find(contests, (c) => c.id === '750000015');
  const pickOneContest = find(contests, (c) => c.id === '750000016');
  assert(eitherNeitherContest.type === 'yesno');
  assert(pickOneContest.type === 'yesno');

  const mergedContests = mergeMsEitherNeitherContests(contests);
  const mergedContest = find(
    mergedContests,
    (c) => c.id === '750000015-750000016-either-neither'
  );

  expect(mergedContests).toHaveLength(contests.length - 1);
  expect(mergedContests).not.toContain(eitherNeitherContest);
  expect(mergedContests).not.toContain(pickOneContest);
  expect(mergedContests.indexOf(mergedContest)).toEqual(
    contests.indexOf(eitherNeitherContest)
  );
  expect(mergedContest).toMatchObject({
    type: 'ms-either-neither',
    id: '750000015-750000016-either-neither',
    districtId: eitherNeitherContest.districtId,
    title: eitherNeitherContest.title,
    eitherNeitherContestId: eitherNeitherContest.id,
    pickOneContestId: pickOneContest.id,
    description: eitherNeitherContest.description,
    eitherOption: eitherNeitherContest.yesOption,
    neitherOption: eitherNeitherContest.noOption,
    firstOption: pickOneContest.yesOption,
    secondOption: pickOneContest.noOption,
  });
});

test('mergeMsEitherNeitherContests does nothing if there are no either-neither contests', () => {
  const { contests } = electionGeneral;
  const mergedContests = mergeMsEitherNeitherContests(contests);
  expect(mergedContests).toEqual(contests);
});

test('getContestDistrictName returns the district name for a merged contest', () => {
  const election = electionWithMsEitherNeither;
  const mergedContests = mergeMsEitherNeitherContests(election.contests);
  const mergedContest = find(
    mergedContests,
    (c) => c.id === '750000015-750000016-either-neither'
  );
  expect(getContestDistrictName(election, mergedContest)).toEqual(
    'State Of Mississippi'
  );
  expect(getContestDistrictName(election, election.contests[0])).toEqual(
    'United States'
  );
});
