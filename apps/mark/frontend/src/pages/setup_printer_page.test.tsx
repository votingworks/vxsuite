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

  apiMock.expectGetUsbPortStatus();

  // Expect at least one playSound call for alarm
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  // USB ports are auto-disabled when alarm plays
  apiMock.expectToggleUsbPorts('disable');

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

  apiMock.expectGetUsbPortStatus();

  // Expect at least one playSound call for alarm
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  // USB ports are auto-disabled when alarm plays
  apiMock.expectToggleUsbPorts('disable');

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

  apiMock.expectGetUsbPortStatus();

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

  apiMock.expectGetUsbPortStatus();

  // Alarm plays when polls are open/paused even without active voter session
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  // USB ports are auto-disabled when alarm plays
  apiMock.expectToggleUsbPorts('disable');

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

  apiMock.expectGetUsbPortStatus();

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

  apiMock.expectGetUsbPortStatus();

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

test('mutes audio on render when alarm plays, unmutes on unmount', async () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  apiMock.expectGetUsbPortStatus();

  // Expect playSound calls for alarm
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  // USB ports are auto-disabled when alarm plays
  apiMock.expectToggleUsbPorts('disable');

  const { unmount } = renderInAppContext(
    <SetupPrinterPage isCardlessVoterAuth pollsState="polls_open" />
  );
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(false);

  // Advance time to trigger alarm plays and USB auto-disable before unmount
  // Wait for query to resolve and effect to run
  await screen.findByRole('heading', { name: 'No Printer Detected' });
  vi.advanceTimersByTime(5000);

  unmount();
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(true);
});

test('does not mute audio when poll worker is authenticated', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);
  audioControlsMock.setIsEnabled.mockClear();

  apiMock.expectGetUsbPortStatus();

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

  apiMock.expectGetUsbPortStatus();

  // Alarm plays when polls are open
  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  // USB ports are auto-disabled when alarm plays
  apiMock.expectToggleUsbPorts('disable');

  renderInAppContext(
    <SetupPrinterPage isCardlessVoterAuth={false} pollsState="polls_open" />
  );
  // Audio is muted when alarm plays
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(false);

  vi.advanceTimersByTime(5000);
});

// Note: The auto-disable USB ports behavior is implicitly tested in the alarm tests above
// (e.g., 'displays alarm and poll worker prompt when cardless voter session is active')
// which now include expectToggleUsbPorts('disable')

test('does not auto-disable USB ports if already disabled', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // Re-setup with USB ports already disabled (override the beforeEach setup)
  apiMock.expectGetUsbPortStatus(false);

  apiMock.mockApiClient.playSound
    .expectRepeatedCallsWith({ name: 'alarm' })
    .resolves();

  // No expectToggleUsbPorts call expected since ports are already disabled

  renderInAppContext(
    <SetupPrinterPage
      isPollWorkerAuth={false}
      isCardlessVoterAuth={false}
      pollsState="polls_open"
    />
  );

  // Advance time for effects to run
  vi.advanceTimersByTime(5000);
});

test('shows re-enable USB button for poll worker when ports are disabled', async () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // Re-setup with USB ports disabled
  apiMock.expectGetUsbPortStatus(false);

  // No alarm when poll worker is authenticated

  renderInAppContext(
    <SetupPrinterPage
      isPollWorkerAuth
      isCardlessVoterAuth={false}
      pollsState="polls_open"
    />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Connect the printer to continue.');
  await screen.findByText(
    'USB ports were automatically disabled for security when the printer disconnected during voting.'
  );
  screen.getByRole('button', { name: 'Enable USB Ports' });
});

test('does not show re-enable USB button when ports are already enabled', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // USB ports are enabled
  apiMock.expectGetUsbPortStatus(true);

  renderInAppContext(
    <SetupPrinterPage
      isPollWorkerAuth
      isCardlessVoterAuth={false}
      pollsState="polls_open"
    />
  );

  screen.getByRole('heading', { name: 'No Printer Detected' });
  screen.getByText('Connect the printer to continue.');
  expect(
    screen.queryByRole('button', { name: 'Enable USB Ports' })
  ).not.toBeInTheDocument();
});

test('re-enable USB button works correctly', async () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  // Re-setup with USB ports disabled
  apiMock.expectGetUsbPortStatus(false);

  renderInAppContext(
    <SetupPrinterPage
      isPollWorkerAuth
      isCardlessVoterAuth={false}
      pollsState="polls_open"
    />
  );

  const reEnableButton = await screen.findByRole('button', {
    name: 'Enable USB Ports',
  });

  // Expect the toggle mutation to be called with 'enable'
  apiMock.expectToggleUsbPorts('enable');

  reEnableButton.click();
});
