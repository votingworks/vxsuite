import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { render, screen } from '../../test/react_testing_library';
import {
  PollsNotOpenScreen,
  PollsNotOpenScreenProps,
} from './polls_not_open_screen';
import {
  ApiMock,
  createApiMock,
  machineConfig,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';

const TEST_BALLOT_COUNT = 50;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig({
    precinctSelection: singlePrecinctSelectionFor('23'),
  });
  apiMock.expectGetScannerStatus(statusNoPaper);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<PollsNotOpenScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <PollsNotOpenScreen
        isLiveMode
        pollsState="polls_closed_initial"
        scannedBallotCount={TEST_BALLOT_COUNT}
        {...props}
      />
    )
  );
}

describe('PollsNotOpenScreen', () => {
  test('shows correct state on initial polls closed', async () => {
    renderScreen();
    await screen.findByText('Polls Closed');
    screen.getByText('Insert a poll worker card to open polls.');
  });

  test('shows correct state on polls paused', async () => {
    renderScreen({ pollsState: 'polls_paused' });
    await screen.findByText('Polls Paused');
    screen.getByText('Insert a poll worker card to open polls.');
  });

  test('shows correct state on final polls closed', async () => {
    renderScreen({ pollsState: 'polls_closed_final' });
    await screen.findByText('Polls Closed');
    screen.getByText('Voting is complete.');
    expect(
      screen.queryByText('Insert a poll worker card to open polls.')
    ).not.toBeInTheDocument();
  });

  test('does not show "No Power Detected" when not called for', async () => {
    renderScreen();
    await screen.findByText('Polls Closed');
    expect(screen.queryAllByText('No Power Detected.').length).toEqual(0);
  });

  test('shows ballot count', async () => {
    renderScreen();
    await screen.findByText(TEST_BALLOT_COUNT);
  });

  test('shows jurisdiction, precinct, and machine id in election info bar', async () => {
    renderScreen();
    await screen.findByText('Franklin County');
    await screen.findByText('State of Hamilton');
    screen.getByText('Center Springfield');
    screen.getByText(machineConfig.machineId);
  });
});
