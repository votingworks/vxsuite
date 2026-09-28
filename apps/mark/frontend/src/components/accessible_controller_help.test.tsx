import { expect, test, vi } from 'vitest';
import { Keybinding } from '@votingworks/ui';
import { fireEvent, render, screen } from '../../test/react_testing_library.js';
import { AccessibleControllerHelp } from './accessible_controller_help.js';

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  MarkControllerSandbox: () => <div>MockMarkControllerSandbox</div>,
}));

test('toggles controller sandbox on help button presses', () => {
  render(
    <AccessibleControllerHelp>
      <div>Ballot</div>
    </AccessibleControllerHelp>
  );

  screen.getByText('Ballot');
  expect(screen.queryByText('MockMarkControllerSandbox')).toBeNull();

  fireEvent.keyDown(document, { key: Keybinding.TOGGLE_HELP });
  screen.getByText('MockMarkControllerSandbox');
  expect(screen.queryByText('Ballot')).toBeNull();

  fireEvent.keyDown(document, { key: Keybinding.TOGGLE_HELP });
  screen.getByText('MockMarkControllerSandbox');

  fireEvent.keyDown(document, { key: Keybinding.TOGGLE_HELP });
  screen.getByText('Ballot');
});
