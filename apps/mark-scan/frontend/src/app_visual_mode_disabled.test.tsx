import { Hardware, MemoryHardware } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { App } from './app';
import { render, screen } from '../test/react_testing_library';

let hardware: Hardware;
beforeEach(() => {
  hardware = MemoryHardware.buildStandard();
});

test('renders overlay when audio-only mode is enabled', () => {
  render(<App hardware={hardware} />, {
    vxTheme: { isVisualModeDisabled: true },
  });

  userEvent.click(screen.getByText('Exit Audio-Only Mode'));
});
