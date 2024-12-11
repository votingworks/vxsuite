import { it, vi } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { CastBallotPage } from './cast_ballot_page';

it('renders CastBallotPage', () => {
  render(<CastBallotPage hidePostVotingInstructions={vi.fn()} />);

  screen.getByRole('heading', { name: /almost done/i });
  screen.getByText(/verify your official ballot/i);
  screen.getByText(/scan your official ballot/i);
});
