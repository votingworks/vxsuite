import { afterEach, beforeEach, expect, MockInstance, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { HeadphoneInputDiagnosticScreen } from './headphone_input_diagnostic_screen';

let apiMock: ApiMock;
let onComplete: () => void;
let onCancel: () => void;

function renderScreen(): {
  audioElement: HTMLAudioElement;
  playSpy: MockInstance;
} {
  render(
    provideApi(
      apiMock,
      <HeadphoneInputDiagnosticScreen
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )
  );

  const audioElement: HTMLAudioElement = screen.getByTestId(
    'headphone-diagnostic-audio'
  );

  function mockPlay(this: HTMLAudioElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  const playSpy = vi.spyOn(audioElement, 'play').mockImplementation(mockPlay);

  return { audioElement, playSpy };
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

test('renders headphone input diagnostic screen', () => {
  renderScreen();

  screen.getByRole('heading', { name: 'Headphone Input Test' });
  screen.getByText(/Connect headphones to the headphone input/);
  screen.getByRole('button', { name: 'Play Audio' });
  screen.getByRole('button', { name: 'Sound Is Audible' });
  screen.getByRole('button', { name: 'Sound Is Not Audible' });
  screen.getByRole('button', { name: 'Cancel Test' });
});

test('pressing play causes the audio file to play', async () => {
  const { playSpy } = renderScreen();

  userEvent.click(await screen.findByRole('button', { name: 'Play Audio' }));

  expect(playSpy).toHaveBeenCalledTimes(1);
});

test('play button is disabled when sound is playing', async () => {
  const { audioElement, playSpy } = renderScreen();

  userEvent.click(await screen.findByRole('button', { name: 'Play Audio' }));

  expect(playSpy).toHaveBeenCalledTimes(1);
  const playingButton = await screen.findByRole('button', {
    name: 'Audio is Playing',
  });
  expect(playingButton).toBeDisabled();

  fireEvent(audioElement, new Event('ended'));
  const playButton = await screen.findByRole('button', {
    name: 'Play Audio',
  });
  expect(playButton).not.toBeDisabled();
});

test('user confirms sound is audible - passes test', async () => {
  expect(onComplete).toHaveBeenCalledTimes(0);
  apiMock.expectAddDiagnosticRecord({
    type: 'mark-headphone-input',
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
    type: 'mark-headphone-input',
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
