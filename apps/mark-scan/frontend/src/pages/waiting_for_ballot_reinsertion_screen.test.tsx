import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';
import { useIsVoterAuth } from '../hooks/use_is_voter_auth';
import { WaitingForBallotReinsertionBallotScreen } from './waiting_for_ballot_reinsertion_screen';

vi.mock(import('../api.js'));
vi.mock(import('../hooks/use_is_voter_auth.js'));
vi.mock(import('../components/deactivate_voter_session_button.js'));

const mockUseIsVoterAuth = vi.mocked(useIsVoterAuth);

const MOCK_REST_SESSION_BUTTON_TEST_ID = 'MockResetSessionButton';

beforeEach(() => {
  vi.mocked(ResetVoterSessionButton).mockImplementation(() => (
    <div data-testid={MOCK_REST_SESSION_BUTTON_TEST_ID} />
  ));
});

test('with voter auth', () => {
  mockUseIsVoterAuth.mockReturnValue(true);

  render(<WaitingForBallotReinsertionBallotScreen />);

  screen.getByText(/ballot removed/i);
  expect(
    screen.queryByTestId(MOCK_REST_SESSION_BUTTON_TEST_ID)
  ).not.toBeInTheDocument();
});

test('with non-voter auth', () => {
  mockUseIsVoterAuth.mockReturnValue(false);

  render(<WaitingForBallotReinsertionBallotScreen />);

  screen.getByText(/ballot removed/i);
  screen.getByTestId(MOCK_REST_SESSION_BUTTON_TEST_ID);
});
