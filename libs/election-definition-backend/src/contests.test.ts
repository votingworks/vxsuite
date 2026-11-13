import { expect, test } from 'vitest';
import type { YesNoContest } from '@votingworks/types';
import { hasDuplicateOptionLabels } from './contests.js';

const contest: YesNoContest = {
  id: 'measure',
  type: 'yesno',
  title: 'Measure 1',
  districtId: 'district-1',
  description: 'Should we?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
};

test('hasDuplicateOptionLabels', () => {
  expect(hasDuplicateOptionLabels(contest)).toEqual(false);
  expect(
    hasDuplicateOptionLabels({
      ...contest,
      options: [...contest.options, { id: 'abstain', label: 'Yes' }],
    })
  ).toEqual(true);
});
