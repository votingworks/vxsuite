import { mockOf, mockUseAudioControls } from '@votingworks/test-utils';
import { useAudioEnabled } from '@votingworks/ui';
import { render } from '../../test/react_testing_library';
import { ScannerOpenAlarmScreen } from './scanner_open_alarm_screen';

const audioControlsMock = mockUseAudioControls();
jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  useAudioEnabled: jest.fn(),
  useAudioControls: () => audioControlsMock,
}));

test('mutes audio on render, unmutes on unmount', () => {
  const mockUseAudioEnabled = mockOf(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  const { unmount } = render(<ScannerOpenAlarmScreen />);
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(false);

  unmount();
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(true);
});
