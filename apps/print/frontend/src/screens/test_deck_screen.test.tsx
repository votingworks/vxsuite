import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  ApiMockProvider,
  createApiMock,
} from '../../test/mock_api_client';
import { TestDeckScreen } from './test_deck_screen';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const { election } = electionDefinition;

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
  vi.useRealTimers();
});

function mockBaseQueries({ printerConnected = true } = {}) {
  apiMock.getElectionRecord.expectOptionalRepeatedCallsWith().resolves({
    electionDefinition,
    electionPackageHash: 'test-hash',
  });
  apiMock.getMachineConfig.expectOptionalRepeatedCallsWith().resolves({
    machineId: 'test-machine',
    codeVersion: 'test-version',
  });
  apiMock.getPrecinctSelection.expectOptionalRepeatedCallsWith().resolves(null);
  apiMock.getPollingPlaceId.expectOptionalRepeatedCallsWith().resolves(null);
  apiMock.getDeviceStatuses.expectOptionalRepeatedCallsWith().resolves({
    usbDrive: { status: 'no_drive' },
    printer: printerConnected
      ? { connected: true, config: HP_LASER_PRINTER_CONFIG }
      : { connected: false },
  });
  apiMock.getTestMode.expectOptionalRepeatedCallsWith().resolves(true);
}

function renderScreen() {
  return render(
    <ApiMockProvider apiMock={apiMock}>
      <MemoryRouter initialEntries={['/print']}>
        <TestDeckScreen isElectionManagerAuth />
      </MemoryRouter>
    </ApiMockProvider>
  );
}

function getButton(name: string | RegExp) {
  return screen.getByRole('button', { name });
}

test('renders the precinct selector and both test deck buttons', async () => {
  mockBaseQueries();
  renderScreen();

  await screen.findByText('Print Test Deck');
  expect(getButton('Print test deck for all precincts')).toBeInTheDocument();
  expect(getButton('Print test deck for precinct')).toBeInTheDocument();
});

test('prints a test deck for all precincts', async () => {
  mockBaseQueries();
  renderScreen();
  await screen.findByText('Print Test Deck');

  apiMock.getTestDeckBallotCount
    .expectRepeatedCallsWith({ precinctId: undefined })
    .resolves(20);
  userEvent.click(getButton('Print test deck for all precincts'));

  await screen.findByText('Print 20 test deck ballots and tally report?');

  apiMock.printTestDeck.expectCallWith({ precinctId: undefined }).resolves();
  userEvent.click(getButton('Print 20 Ballots'));

  await screen.findByText('Printing');
});

test('prints a test deck for the selected precinct', async () => {
  mockBaseQueries();
  renderScreen();
  await screen.findByText('Print Test Deck');

  // Defaults to the first precinct in the election.
  const precinctId = election.precincts[0].id;

  apiMock.getTestDeckBallotCount
    .expectRepeatedCallsWith({ precinctId })
    .resolves(5);
  userEvent.click(getButton('Print test deck for precinct'));

  await screen.findByText('Print 5 test deck ballots and tally report?');

  apiMock.printTestDeck.expectCallWith({ precinctId }).resolves();
  userEvent.click(getButton('Print 5 Ballots'));

  await screen.findByText('Printing');
});

test('Cancel closes the confirm modal without printing', async () => {
  mockBaseQueries();
  renderScreen();
  await screen.findByText('Print Test Deck');

  apiMock.getTestDeckBallotCount
    .expectRepeatedCallsWith({ precinctId: undefined })
    .resolves(20);
  userEvent.click(getButton('Print test deck for all precincts'));

  await screen.findByText('Print 20 test deck ballots and tally report?');
  userEvent.click(getButton('Cancel'));

  expect(
    screen.queryByText('Print 20 test deck ballots and tally report?')
  ).not.toBeInTheDocument();
});

test('disables both buttons when the printer is not connected', async () => {
  mockBaseQueries({ printerConnected: false });
  renderScreen();

  await screen.findByText('Print Test Deck');
  expect(getButton('Print test deck for all precincts')).toBeDisabled();
  expect(getButton('Print test deck for precinct')).toBeDisabled();
});
