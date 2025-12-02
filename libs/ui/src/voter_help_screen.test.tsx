import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../test/react_testing_library';
import {
  VoterHelpScreen,
  VoterHelpScreenH2,
  VoterHelpScreenH3,
  VoterHelpScreenP,
} from './voter_help_screen';

test('VoterHelpScreen', () => {
  const onClose = vi.fn();
  render(
    <VoterHelpScreen onClose={onClose}>
      <VoterHelpScreenH2>Section</VoterHelpScreenH2>
      <VoterHelpScreenH3>Subsection</VoterHelpScreenH3>
      <VoterHelpScreenP>Content</VoterHelpScreenP>
    </VoterHelpScreen>
  );

  screen.getByRole('heading', { name: 'Voter Instructions' });
  screen.getByRole('heading', { name: 'Section' });
  screen.getByRole('heading', { name: 'Subsection' });
  screen.getByText('Content');
  const closeButton = screen.getByRole('button', { name: 'Close' });
  userEvent.click(closeButton);
  expect(onClose).toHaveBeenCalledTimes(1);
});
