import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { SystemAudioDiagnosticScreen } from './system_audio_diagnostic_screen';

let apiMock: ApiMock;
let onComplete: () => void;
let onCancel: () => void;

function renderScreen() {
  return render(
    provideApi(
      apiMock,
      <SystemAudioDiagnosticScreen
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )
  );
}

beforeEach(() => {
  onComplete = vi.fn();
  onCancel = vi.fn();
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-03-23T11:23:00.000'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders system audio diagnostic screen', () => {
  renderScreen();

  screen.getByRole('heading', { name: 'System Audio Test' });
  screen.getByText(
    'Press the button below to play audio through the system speakers.'
  );
  screen.getByRole('button', { name: 'Play Audio' });
  screen.getByRole('button', { name: 'Sound Is Audible' });
  screen.getByRole('button', { name: 'Sound Is Not Audible' });
  screen.getByRole('button', { name: 'Cancel Test' });
});

test('pressing play audio calls playSound API', async () => {
  apiMock.expectPlaySound('chime');
  renderScreen();

  userEvent.click(await screen.findByRole('button', { name: 'Play Audio' }));
});

test('user confirms sound is audible - passes test', async () => {
  expect(onComplete).toHaveBeenCalledTimes(0);
  apiMock.expectAddDiagnosticRecord({
    type: 'mark-system-audio',
    outcome: 'pass',
  });
  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Sound Is Audible' })
  );

  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('user confirms sound is not audible - fails test', async () => {
  expect(onComplete).toHaveBeenCalledTimes(0);
  apiMock.expectAddDiagnosticRecord({
    type: 'mark-system-audio',
    outcome: 'fail',
  });
  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Sound Is Not Audible' })
  );

  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('pressing cancel calls onCancel', async () => {
  expect(onCancel).toHaveBeenCalledTimes(0);
  renderScreen();

  userEvent.click(await screen.findByRole('button', { name: 'Cancel Test' }));

  expect(onCancel).toHaveBeenCalledTimes(1);
});
