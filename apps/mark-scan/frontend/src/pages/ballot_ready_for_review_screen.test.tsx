import { test, vi } from 'vitest';
import { render, screen } from '../../test/react_testing_library.js';
import { BallotReadyForReviewScreen } from './ballot_ready_for_review_screen.js';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button.js';

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
