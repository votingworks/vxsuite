import { expect, test, vi } from 'vitest';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { useAudioEnabled } from '@votingworks/ui';
import { render, screen } from '../../test/react_testing_library';
import { SetupPrinterPage } from './setup_printer_page';

const audioControlsMock = mockUseAudioControls(vi.fn);
vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  useAudioEnabled: vi.fn(),
  useAudioControls: () => audioControlsMock,
}));

test('displays alarm and poll worker prompt when polls are open and not poll worker auth', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  render(<SetupPrinterPage isPollWorkerAuth={false} pollsState="polls_open" />);

  screen.getByText('Internal Connection Problem');
  screen.getByText('Printer is disconnected.');
  screen.getByText('Please ask a poll worker for help.');
  screen.getByText('Poll Workers:');
  screen.getByText(
    'Insert a poll worker card to silence the alert. Connect the printer to resume voting.'
  );

  // Verify alarm audio element is present
  const audioElement = document.querySelector('audio');
  expect(audioElement).toBeTruthy();
  expect(audioElement?.getAttribute('src')).toEqual('/sounds/alarm.mp3');
  expect(audioElement?.hasAttribute('autoplay')).toEqual(true);
  expect(audioElement?.hasAttribute('loop')).toEqual(true);
});

test('displays alarm when polls are paused', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  render(
    <SetupPrinterPage isPollWorkerAuth={false} pollsState="polls_paused" />
  );

  screen.getByText('Internal Connection Problem');
  screen.getByText('Printer is disconnected.');

  // Verify alarm audio element is present
  const audioElement = document.querySelector('audio');
  expect(audioElement).toBeTruthy();
});

test('does not display alarm when poll worker auth', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  render(<SetupPrinterPage isPollWorkerAuth pollsState="polls_open" />);

  screen.getByText('No Printer Detected');
  screen.getByText('Please ask a poll worker to connect printer.');

  // Verify alarm audio element is NOT present
  const audioElement = document.querySelector('audio');
  expect(audioElement).toBeFalsy();
  expect(screen.queryByText('Poll Workers:')).toBeFalsy();
});

test('does not display alarm when polls are closed initial', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  render(
    <SetupPrinterPage
      isPollWorkerAuth={false}
      pollsState="polls_closed_initial"
    />
  );

  screen.getByText('No Printer Detected');
  screen.getByText('Please ask a poll worker to connect printer.');

  // Verify alarm audio element is NOT present
  const audioElement = document.querySelector('audio');
  expect(audioElement).toBeFalsy();
});

test('does not display alarm when polls are closed final', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  render(
    <SetupPrinterPage
      isPollWorkerAuth={false}
      pollsState="polls_closed_final"
    />
  );

  screen.getByText('No Printer Detected');
  screen.getByText('Please ask a poll worker to connect printer.');

  // Verify alarm audio element is NOT present
  const audioElement = document.querySelector('audio');
  expect(audioElement).toBeFalsy();
});

test('mutes audio on render when alarm plays, unmutes on unmount', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);

  const { unmount } = render(
    <SetupPrinterPage isPollWorkerAuth={false} pollsState="polls_open" />
  );
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(false);

  unmount();
  expect(audioControlsMock.setIsEnabled).toHaveBeenLastCalledWith(true);
});

test('does not mute audio when poll worker is authenticated', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);
  audioControlsMock.setIsEnabled.mockClear();

  render(<SetupPrinterPage isPollWorkerAuth pollsState="polls_open" />);
  expect(audioControlsMock.setIsEnabled).not.toHaveBeenCalled();
});

test('does not mute audio when polls are closed', () => {
  const mockUseAudioEnabled = vi.mocked(useAudioEnabled);
  mockUseAudioEnabled.mockReturnValue(true);
  audioControlsMock.setIsEnabled.mockClear();

  render(
    <SetupPrinterPage
      isPollWorkerAuth={false}
      pollsState="polls_closed_final"
    />
  );
  expect(audioControlsMock.setIsEnabled).not.toHaveBeenCalled();
});
