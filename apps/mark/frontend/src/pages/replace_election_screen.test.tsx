import {
  electionGeneralDefinition,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import {
  ReplaceElectionScreen,
  ReplaceElectionScreenProps,
} from './replace_election_screen';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiClientContext, createQueryClient } from '../api';

const machineElectionDefinition = electionGeneralDefinition;
const authElectionHash = electionTwoPartyPrimaryDefinition.electionHash.slice(
  0,
  10
);
const screenReader = new AriaScreenReader(fakeTts());

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<ReplaceElectionScreenProps> = {}) {
  return render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <ReplaceElectionScreen
          ballotsPrintedCount={0}
          // Election hashes must differ for this screen to be rendered
          authElectionHash={authElectionHash}
          electionDefinition={machineElectionDefinition}
          machineConfig={fakeMachineConfig()}
          screenReader={screenReader}
          isLoading={false}
          isError={false}
          {...props}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('loading state', () => {
  renderScreen({ isLoading: true });

  userEvent.click(screen.getByText('Unconfiguring election on machine…'));
});

test('error state', () => {
  renderScreen({ isError: true });

  userEvent.click(screen.getByText('Error unconfiguring the machine.'));
});

test('showing count of ballots printed: 0 ballots', async () => {
  renderScreen();

  await screen.findByText(authElectionHash);
  screen.getByText(
    'This machine has not printed any ballots for the current election.'
  );
});

test('showing count of ballots printed: >0 ballots', async () => {
  renderScreen({ ballotsPrintedCount: 129 });

  await screen.findByText(authElectionHash);
  expect(screen.getByText('129 ballots').parentElement?.textContent).toEqual(
    'This machine has printed 129 ballots for the current election.'
  );
});
