import { render, screen } from '../../test/react_testing_library';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';
import { useIsVoterAuth } from '../hooks/use_is_voter_auth';
import { WaitingForBallotReinsertionBallotScreen } from './waiting_for_ballot_reinsertion_screen';

jest.mock('../api');
jest.mock('../hooks/use_is_voter_auth');
jest.mock('../components/deactivate_voter_session_button');

const mockUseIsVoterAuth = jest.mocked(useIsVoterAuth);

const MOCK_REST_SESSION_BUTTON_TEST_ID = 'MockResetSessionButton';

beforeEach(() => {
  jest
    .mocked(ResetVoterSessionButton)
    .mockImplementation(() => (
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
