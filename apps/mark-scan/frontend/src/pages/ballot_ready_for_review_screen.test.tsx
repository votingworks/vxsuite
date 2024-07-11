import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import { BallotReadyForReviewScreen } from './ballot_ready_for_review_screen';

test('renders instructions', () => {
  render(<BallotReadyForReviewScreen resetCardlessVoterSession={jest.fn()} />);
  screen.getByText(/remove the poll worker card/i);
});

test('allows voter session deactivation', () => {
  const mockReset = jest.fn();

  render(<BallotReadyForReviewScreen resetCardlessVoterSession={mockReset} />);

  expect(mockReset).not.toHaveBeenCalled();

  userEvent.click(screen.getButton(/deactivate/i));
  expect(mockReset).toHaveBeenCalled();
});
