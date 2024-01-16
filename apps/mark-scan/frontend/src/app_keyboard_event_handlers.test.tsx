import { ALL_PRECINCTS_SELECTION, MemoryHardware } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { fakeUseAudioControls, mockOf } from '@votingworks/test-utils';
import { AudioControls } from '@votingworks/types';
import { useAudioControls } from '@votingworks/ui';
import { App } from './app';
import { render, screen } from '../test/react_testing_library';
import { createApiMock, ApiMock } from '../test/helpers/mock_api_client';
import { electionDefinition } from '../test/helpers/election';

let apiMock: ApiMock;
let hardware: MemoryHardware;
const audioControls: AudioControls = fakeUseAudioControls();

beforeEach(() => {
  mockOf(useAudioControls).mockReturnValue(audioControls);

  apiMock = createApiMock();
  hardware = MemoryHardware.buildStandard();

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  apiMock.expectGetSystemSettings();
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);
});

test.each([
  { key: '{Help}', expectedFnCall: audioControls.replay },
  { key: '[[', expectedFnCall: audioControls.decreasePlaybackRate },
  { key: ']]', expectedFnCall: audioControls.increasePlaybackRate },
  { key: '{Pause}', expectedFnCall: audioControls.togglePause },
  { key: '-', expectedFnCall: audioControls.decreaseVolume },
  { key: '=', expectedFnCall: audioControls.increaseVolume },
])(
  '"$key" key calls expected audioControls function',
  async ({ key, expectedFnCall }) => {
    apiMock.setPaperHandlerState('waiting_for_ballot_data');

    render(
      <App
        hardware={hardware}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );
    await screen.findByText('Start Voting');

    userEvent.keyboard(key);

    expect(expectedFnCall).toHaveBeenCalled();
  }
);
