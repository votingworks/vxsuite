import { expect, test, vi } from 'vitest';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { PrecinctScannerStatus } from '@votingworks/scan-backend';
import { sleep } from '@votingworks/basics';
import { render, waitFor } from '../../test/react_testing_library';
import { VoterScreen, VoterScreenProps } from './voter_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import {
  useScanFeedbackAudio,
  UseScanFeedbackAudioInput,
} from '../utils/use_scan_feedback_audio';

vi.mock('../utils/use_scan_feedback_audio.ts');
vi.mock('./insert_ballot_screen');

const electionDefinition = electionGeneralFixtures.readElectionDefinition();

const useScanFeedbackAudioMock = vi
  .mocked(useScanFeedbackAudio)
  .mockImplementation(() => {});

function renderScreen(
  scannerStatus: PrecinctScannerStatus,
  props: Partial<VoterScreenProps>
): { apiMock: ApiMock } {
  const apiMock = createApiMock();
  apiMock.expectGetScannerStatus(scannerStatus);

  render(
    provideApi(
      apiMock,
      <VoterScreen
        electionDefinition={electionDefinition}
        isSoundMuted={false}
        isTestMode={false}
        systemSettings={DEFAULT_SYSTEM_SETTINGS}
        {...props}
      />
    )
  );

  return { apiMock };
}

test('renders useScanFeedbackAudio hook', async () => {
  const { apiMock } = renderScreen(statusNoPaper, { isSoundMuted: false });

  let playSound: UseScanFeedbackAudioInput['playSound'] | undefined;
  useScanFeedbackAudioMock.mockImplementation((input) => {
    playSound = input.playSound;
  });

  expect(useScanFeedbackAudioMock).toHaveBeenLastCalledWith<
    [UseScanFeedbackAudioInput]
  >({
    currentState: undefined,
    isSoundMuted: false,
    playSound: expect.anything(),
  });

  apiMock.mockApiClient.assertComplete();

  await waitFor(() =>
    expect(useScanFeedbackAudioMock).toHaveBeenLastCalledWith<
      [UseScanFeedbackAudioInput]
    >({
      currentState: 'waiting_for_ballot',
      isSoundMuted: false,
      playSound: expect.anything(),
    })
  );

  // Verify playSound API is passed to the hook:

  apiMock.expectPlaySound('error');

  playSound?.({ name: 'error' });
  await sleep(0);

  apiMock.mockApiClient.playSound.assertComplete();
});
