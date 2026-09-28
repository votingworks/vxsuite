import { expect, test } from 'vitest';
import { Keybinding } from '@votingworks/ui';
import { fireEvent, render, screen } from '../../test/react_testing_library.js';
import { AccessibleControllerHelp } from './accessible_controller_help.js';

test('toggles controller help on help button presses', () => {
  render(
    <AccessibleControllerHelp>
      <div>Ballot</div>
    </AccessibleControllerHelp>
  );

  screen.getByText('Ballot');
  expect(screen.queryByRole('heading', { name: 'Controller Help' })).toBeNull();

  fireEvent.keyDown(document, { key: Keybinding.TOGGLE_HELP });
  screen.getByRole('heading', { name: 'Controller Help' });
  screen.getByText(/This is the Help button/);
  expect(screen.queryByText('Ballot')).toBeNull();

  fireEvent.keyDown(document, { key: Keybinding.TOGGLE_HELP });
  screen.getByRole('heading', { name: 'Controller Help' });

  fireEvent.keyDown(document, { key: Keybinding.TOGGLE_HELP });
  screen.getByText('Ballot');
});
