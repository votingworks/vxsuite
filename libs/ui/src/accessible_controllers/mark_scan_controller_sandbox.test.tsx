import { expect, test, vi } from 'vitest';
import { MarkScanControllerSandbox } from './mark_scan_controller_sandbox';
import { render, screen } from '../../test/react_testing_library';
import { AccessibleControllerSandbox } from './accessible_controller_sandbox';
import {
  MARK_SCAN_CONTROLLER_KEYBINDINGS,
  MarkScanControllerButton,
} from './types';
import { Keybinding } from '../keybindings';
import { MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME } from '.';

vi.mock(import('./accessible_controller_sandbox.js'), async (importActual) => ({
  ...(await importActual()),
  AccessibleControllerSandbox: vi.fn(),
}));

test('all relevant buttons configured', () => {
  vi.mocked(AccessibleControllerSandbox).mockImplementation((props) => {
    const { feedbackStringKeys } = props;

    expect(Object.keys(feedbackStringKeys).sort()).toEqual<
      MarkScanControllerButton[]
    >([...MARK_SCAN_CONTROLLER_KEYBINDINGS].sort());

    return <div />;
  });

  render(<MarkScanControllerSandbox />);
});

test('highlights relevant portion of illustration', () => {
  vi.mocked(AccessibleControllerSandbox).mockImplementation((props) => {
    const { illustration } = props;
    const Illustration = illustration;

    return <Illustration highlight={Keybinding.TOGGLE_PAUSE} />;
  });

  render(<MarkScanControllerSandbox />);

  expect(screen.getByTestId('pause')).toHaveClass(
    MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME
  );
});
