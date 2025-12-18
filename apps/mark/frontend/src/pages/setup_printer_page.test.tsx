import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { useAudioEnabled } from '@votingworks/ui';
import { render, screen } from '../../test/react_testing_library';
import { SetupPrinterPage } from './setup_printer_page';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';

vi.useFakeTimers({ shouldAdvanceTime: true });

const audioControlsMock = mockUseAudioControls(vi.fn);
vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  useAudioEnabled: vi.fn(),
  useAudioControls: () => audioControlsMock,
}));

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderInAppContext(ui: React.ReactNode) {
  return render(provideApi(apiMock, ui));
}

test('displays alarm and poll worker prompt when cardless voter session is active', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // Expect at least one playSound call for alarm
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  renderInAppContext(
    <SetupPrinterPage isCardlessVoterAuth pollsState="polls_open" />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Please ask a poll worker for help.');
  screen.getByText('Poll Workers:');
  screen.getByText(
    'Insert a poll worker card to silence the alert. Connect the printer to resume voting.'
  );

  // Because we are in a cardless voter session they can still change visual and audio settings.
  screen.getByText('Settings');

  // Advance time to trigger alarm plays
  vi.advanceTimersByTime(5000);
});

test('displays alarm when polls are paused', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // Expect at least one playSound call for alarm
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  renderInAppContext(
    <SetupPrinterPage isCardlessVoterAuth pollsState="polls_paused" />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Please ask a poll worker for help.');

  // Advance time to trigger alarm plays
  vi.advanceTimersByTime(5000);
});

test('does not display alarm when poll worker auth', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // No playSound expected
  renderInAppContext(
    <SetupPrinterPage isPollWorkerAuth pollsState="polls_open" />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Connect the printer to continue.');
  expect(screen.queryByText('Poll Workers:')).toBeFalsy();

  // Advance time - no alarm should play
  vi.advanceTimersByTime(5000);
});

test('displays alarm but not Settings when polls are open but no cardless voter session', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // Alarm plays when polls are open/paused even without active voter session
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  renderInAppContext(
    <SetupPrinterPage
      isPollWorkerAuth={false}
      isCardlessVoterAuth={false}
      pollsState="polls_open"
    />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Please ask a poll worker for help.');
  expect(screen.queryByText('Settings')).toBeFalsy();

  // Advance time to trigger alarm plays
  vi.advanceTimersByTime(5000);
});

test('does not display alarm when polls are closed initial', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // No playSound expected
  renderInAppContext(
    <SetupPrinterPage
      isCardlessVoterAuth={false}
      pollsState="polls_closed_initial"
    />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Connect the printer to continue.');

  // Advance time - no alarm should play
  vi.advanceTimersByTime(5000);
});

test('does not display alarm when polls are closed final', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // No playSound expected
  renderInAppContext(
    <SetupPrinterPage
      isCardlessVoterAuth={false}
      pollsState="polls_closed_final"
    />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Connect the printer to continue.');

  // Advance time - no alarm should play
  vi.advanceTimersByTime(5000);
});

test('mutes audio on render when alarm plays, unmutes on unmount', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // Expect playSound calls for alarm
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  const { unmount } = renderInAppContext(
    <SetupPrinterPage isCardlessVoterAuth pollsState="polls_open" />
  );
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(false);

  // Advance time to trigger alarm plays before unmount
  vi.advanceTimersByTime(5000);

  unmount();
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(true);
});

test('does not mute audio when poll worker is authenticated', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);
  audioControlsMock.setIsEnabled.mockClear();

  // No playSound expected
  renderInAppContext(
    <SetupPrinterPage isPollWorkerAuth pollsState="polls_open" />
  );
  expect(audioControlsMock.setIsEnabled).not.toHaveBeenCalled();
});

test('mutes audio when polls open even without cardless voter session', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);
  audioControlsMock.setIsEnabled.mockClear();

  // Alarm plays when polls are open
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  renderInAppContext(
    <SetupPrinterPage isCardlessVoterAuth={false} pollsState="polls_open" />
  );
  // Audio is muted when alarm plays
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(false);

  vi.advanceTimersByTime(5000);
});
