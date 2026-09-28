import { expect, test, vi } from 'vitest';
import { MarkControllerSandbox } from './mark_controller_sandbox.js';
import { render, screen } from '../../test/react_testing_library.js';
import { AccessibleControllerSandbox } from './accessible_controller_sandbox.js';
import {
  MARK_CONTROLLER_KEYBINDINGS,
  type MarkControllerButton,
} from './types.js';
import { Keybinding } from '../keybindings.js';
import { MARK_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME } from './index.js';

vi.mock(import('./accessible_controller_sandbox.js'), async (importActual) => ({
  ...(await importActual()),
  AccessibleControllerSandbox: vi.fn(),
}));

test('all relevant buttons configured', () => {
  vi.mocked(AccessibleControllerSandbox).mockImplementation((props) => {
    const { feedbackStringKeys } = props;

    expect(Object.keys(feedbackStringKeys).sort()).toEqual<
      MarkControllerButton[]
    >([...MARK_CONTROLLER_KEYBINDINGS].sort());

    return <div />;
  });

  render(<MarkControllerSandbox />);
});

test.each<[MarkControllerButton, string]>([
  [Keybinding.FOCUS_PREVIOUS, 'up'],
  [Keybinding.FOCUS_NEXT, 'down'],
  [Keybinding.PAGE_PREVIOUS, 'left'],
  [Keybinding.PAGE_NEXT, 'right'],
  [Keybinding.SELECT, 'select'],
  [Keybinding.VOLUME_UP, 'volume-up'],
  [Keybinding.VOLUME_DOWN, 'volume-down'],
  [Keybinding.TOGGLE_PAUSE, 'pause'],
  [Keybinding.TOGGLE_HELP, 'help'],
])('highlights %s button in illustration', (key, testId) => {
  vi.mocked(AccessibleControllerSandbox).mockImplementation((props) => {
    const { illustration } = props;
    const Illustration = illustration;

    return <Illustration highlight={key} />;
  });

  render(<MarkControllerSandbox />);

  expect(screen.getByTestId(testId)).toHaveClass(
    MARK_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME
  );
  for (const otherTestId of [
    'up',
    'down',
    'left',
    'right',
    'select',
    'volume-up',
    'volume-down',
    'pause',
    'help',
  ].filter((id) => id !== testId)) {
    expect(screen.getByTestId(otherTestId)).not.toHaveClass(
      MARK_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME
    );
  }
});
