import userEvent from '@testing-library/user-event';
import { VxRenderResult } from '@votingworks/ui';
import { fireEvent, render, screen } from '../../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../../test/helpers/mock_api_client';
import { HeadphoneInputDiagnosticScreen } from './headphone_input_diagnostic_screen';

let apiMock: ApiMock;
let onClose: () => void;

function renderScreen(): {
  rendered: VxRenderResult;
  audioElement: HTMLAudioElement;
  playSpy: jest.SpyInstance;
} {
  const rendered = render(
    provideApi(apiMock, <HeadphoneInputDiagnosticScreen onClose={onClose} />)
  );

  const audioElement: HTMLAudioElement = screen.getByTestId(
    'headphone-diagnostic-audio'
  );

  function mockPlay(this: HTMLAudioElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  const playSpy = jest.spyOn(audioElement, 'play').mockImplementation(mockPlay);

  return { rendered, audioElement, playSpy };
}

beforeEach(() => {
  onClose = jest.fn();
  jest.useFakeTimers().setSystemTime(new Date('2022-03-23T11:23:00.000'));
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('pressing play causes the audio file to play', async () => {
  const { playSpy } = renderScreen();

  userEvent.click(await screen.findByText('Play Audio'));

  expect(playSpy).toHaveBeenCalledTimes(1);
});

test('play button is disabled when sound is playing', async () => {
  const { audioElement, playSpy } = renderScreen();

  userEvent.click(await screen.findByText('Play Audio'));

  expect(playSpy).toHaveBeenCalledTimes(1);
  const playingButton = await screen.findByRole('button', {
    name: 'Audio is playing',
  });
  expect(playingButton).toBeDisabled();

  fireEvent(audioElement, new Event('ended'));
  const playButton = await screen.findByRole('button', {
    name: 'Play Audio',
  });
  expect(playButton).not.toBeDisabled();
});

test('user confirms sound is audible', async () => {
  expect(onClose).toHaveBeenCalledTimes(0);
  apiMock.expectAddDiagnosticRecord({
    type: 'mark-scan-headphone-input',
    outcome: 'pass',
  });
  renderScreen();
  userEvent.click(await screen.findByText('Sound is Audible'));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('user confirms sound is not audible', async () => {
  expect(onClose).toHaveBeenCalledTimes(0);
  apiMock.expectAddDiagnosticRecord({
    type: 'mark-scan-headphone-input',
    outcome: 'fail',
  });
  renderScreen();
  userEvent.click(await screen.findByText('Sound is Not Audible'));

  expect(onClose).toHaveBeenCalledTimes(1);
});
