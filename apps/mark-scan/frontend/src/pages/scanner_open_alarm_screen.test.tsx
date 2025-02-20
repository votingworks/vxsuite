import { expect, test, vi } from 'vitest';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { useAudioEnabled } from '@votingworks/ui';
import { render } from '../../test/react_testing_library';
import { ScannerOpenAlarmScreen } from './scanner_open_alarm_screen';

const audioControlsMock = mockUseAudioControls(vi.fn);
vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  useAudioEnabled: vi.fn(),
  useAudioControls: () => audioControlsMock,
}));

test('mutes audio on render, unmutes on unmount', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  const { unmount } = render(<ScannerOpenAlarmScreen />);
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(false);

  unmount();
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(true);
});
