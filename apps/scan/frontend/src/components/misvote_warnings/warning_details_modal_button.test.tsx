import { mockOf } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { WarningDetails } from './warning_details';
import { generateContests } from './test_utils.test';
import { WarningDetailsModalButton } from './warning_details_modal_button';

jest.mock('./warning_details', (): typeof import('./warning_details') => ({
  ...jest.requireActual('./warning_details'),
  WarningDetails: jest.fn(),
}));

afterEach(() => {
  jest.resetAllMocks();
});

test('renders modal on button press', () => {
  mockOf(WarningDetails).mockImplementation(() => (
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
  expect(mockOf(WarningDetails)).toBeCalledWith(
    { blankContests, overvoteContests, partiallyVotedContests },
    {}
  );
});

test('closes modal', () => {
  mockOf(WarningDetails).mockImplementation(() => (
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
