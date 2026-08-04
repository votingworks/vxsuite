import { expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { getContestDistrict } from '@votingworks/types';
import { FOCUSABLE_AUDIO_CLASS_NAME } from '@votingworks/ui';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen, render } from '../../test/react_testing_library.js';
import { Breadcrumbs, ContestHeader } from './contest_header.js';

const electionGeneral = readElectionGeneral();
const contest = electionGeneral.contests[0];
const district = getContestDistrict(electionGeneral, contest);

test('renders contest metadata in a focusable, read-on-load block', () => {
  render(<ContestHeader contest={contest} district={district} />);

  const title = screen.getByRole('heading', { name: contest.title });
  screen.getByText(district.name);

  const focusableBlock = title.closest(`.${FOCUSABLE_AUDIO_CLASS_NAME}`);
  expect(focusableBlock).toBeInTheDocument();
  expect(focusableBlock).toHaveAttribute('tabindex', '0');
});

test('Breadcrumbs renders the contest position', () => {
  render(<Breadcrumbs ballotContestCount={15} contestNumber={3} />);

  screen.getByText(hasTextAcrossElements(/contest number: 3/i));
  screen.getByText(hasTextAcrossElements(/total contests: 15/i));
});
