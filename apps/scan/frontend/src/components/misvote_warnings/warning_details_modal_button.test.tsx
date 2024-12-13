import { afterEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { WarningDetails } from './warning_details';
import { generateContests } from './test_utils.test';
import { WarningDetailsModalButton } from './warning_details_modal_button';

vi.mock('./warning_details', async () => ({
  ...(await vi.importActual('./warning_details')),
  WarningDetails: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

test('renders modal on button press', () => {
  vi.mocked(WarningDetails).mockImplementation(() => (
    <div data-testid="mockWarningDetails" />
  ));

  const contests = generateContests(6);
  const blankContests = contests.slice(0, 3);
  const partiallyVotedContests = contests.slice(3, 5);
  const overvoteContests = contests.slice(5);

  render(
    <WarningDetailsModalButton
      blankContests={blankContests}
      overvoteContests={overvoteContests}
      partiallyVotedContests={partiallyVotedContests}
    />
  );
  expect(screen.queryByTestId('mockWarningDetails')).not.toBeInTheDocument();

  userEvent.click(screen.getButton(/view contests/i));

  screen.getByTestId('mockWarningDetails');
  expect(vi.mocked(WarningDetails)).toBeCalledWith(
    { blankContests, overvoteContests, partiallyVotedContests },
    {}
  );
});

test('closes modal', () => {
  vi.mocked(WarningDetails).mockImplementation(() => (
    <div data-testid="mockWarningDetails" />
  ));

  render(
    <WarningDetailsModalButton
      blankContests={[]}
      overvoteContests={[]}
      partiallyVotedContests={[]}
    />
  );
  expect(screen.queryByTestId('mockWarningDetails')).not.toBeInTheDocument();

  userEvent.click(screen.getButton(/view contests/i));
  screen.getByTestId('mockWarningDetails');

  userEvent.click(screen.getButton(/close/i));
  expect(screen.queryByTestId('mockWarningDetails')).not.toBeInTheDocument();
});
