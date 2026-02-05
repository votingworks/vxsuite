import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { CastBallotPage } from './cast_ballot_page';

it('renders CastBallotPage', () => {
  render(<CastBallotPage hidePostVotingInstructions={vi.fn()} />);

  screen.getByRole('heading', { name: /almost done/i });
  screen.getByText(/verify your official ballot/i);
  screen.getByText(/scan your official ballot/i);
});

it('focuses instructions when left arrow is pressed', () => {
  render(<CastBallotPage hidePostVotingInstructions={vi.fn()} />);

  const heading = screen.getByRole('heading', { name: /almost done/i });
  const instructionsContainer = heading.closest('div[tabindex="-1"]');

  userEvent.keyboard('{ArrowLeft}');

  expect(instructionsContainer).toHaveFocus();
});
