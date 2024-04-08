import { mockOf } from '@votingworks/test-utils';
import { MarkScanControllerSandbox } from './mark_scan_controller_sandbox';
import { render, screen } from '../../test/react_testing_library';
import { AccessibleControllerSandbox } from './accessible_controller_sandbox';
import {
  MARK_SCAN_CONTROLLER_KEYBINDINGS,
  MarkScanControllerButton,
} from './types';
import { Keybinding } from '../keybindings';
import { MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME } from '.';

jest.mock(
  './accessible_controller_sandbox',
  (): typeof import('./accessible_controller_sandbox') => ({
    ...jest.requireActual('./accessible_controller_sandbox'),
    AccessibleControllerSandbox: jest.fn(),
  })
);

test('all relevant buttons configured', () => {
  mockOf(AccessibleControllerSandbox).mockImplementation((props) => {
    const { feedbackStringKeys } = props;

    expect(Object.keys(feedbackStringKeys).sort()).toEqual<
      MarkScanControllerButton[]
    >([...MARK_SCAN_CONTROLLER_KEYBINDINGS].sort());

    return <div />;
  });

  render(<MarkScanControllerSandbox />);
});

test('highlights relevant portion of illustration', () => {
  mockOf(AccessibleControllerSandbox).mockImplementation((props) => {
    const { illustration } = props;
    const Illustration = illustration;

    return <Illustration highlight={Keybinding.TOGGLE_PAUSE} />;
  });

  render(<MarkScanControllerSandbox />);

  expect(screen.getByTestId('pause')).toHaveClass(
    MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME
  );
});
