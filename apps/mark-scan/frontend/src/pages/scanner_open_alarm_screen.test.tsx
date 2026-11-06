import { expect, test, vi } from 'vitest';
import { useMuteAudio } from '@votingworks/ui';
import { render } from '../../test/react_testing_library.js';
import { ScannerOpenAlarmScreen } from './scanner_open_alarm_screen.js';

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  useMuteAudio: vi.fn(),
}));

test('mutes audio while rendered', () => {
  render(<ScannerOpenAlarmScreen />);
  expect(vi.mocked(useMuteAudio)).toHaveBeenLastCalledWith(true);
});
