import { test, vi } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { BallotReadyForReviewScreen } from './ballot_ready_for_review_screen';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';

vi.mock(import('../components/deactivate_voter_session_button.js'));

test('renders instructions', () => {
  render(<BallotReadyForReviewScreen />);
  screen.getByText(/remove the poll worker card/i);
});

test('allows voter session deactivation', () => {
  vi.mocked(ResetVoterSessionButton).mockImplementation(() => (
    <div data-testid="MockResetSessionButton" />
  ));

  render(<BallotReadyForReviewScreen />);

  screen.getByTestId('MockResetSessionButton');
});
