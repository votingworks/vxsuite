import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
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
  apiMock.getDeviceStatuses.expectRepeatedCallsWith().resolves({
    usbDrive: { status: 'no_drive' },
    printer: printerConnected
      ? { connected: true, config: HP_LASER_PRINTER_CONFIG }
      : { connected: false },
  });
  apiMock.getElectionRecord.expectCallWith().resolves({
    electionDefinition,
    electionPackageHash: 'test-hash',
  });
  apiMock.getMachineConfig.expectCallWith().resolves({
    machineId: 'test-machine',
    codeVersion: 'test-version',
  });
  apiMock.getPollingPlaceId.expectCallWith().resolves(null);
  apiMock.getSystemSettings.expectCallWith().resolves({
    ...DEFAULT_SYSTEM_SETTINGS,
    enableTestDeckPrinting: true,
  });
  apiMock.getTestMode.expectCallWith().resolves(true);
}

function renderScreen() {
  return render(
    <ApiMockProvider apiMock={apiMock}>
      <MemoryRouter initialEntries={['/print']}>
        <TestDeckScreen />
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

  await screen.findByRole('heading', { name: 'Test Decks' });
  expect(getButton('Print All Test Decks')).toBeInTheDocument();
  expect(getButton('Print Precinct Test Deck')).toBeInTheDocument();
});

test('prints a test deck for all precincts', async () => {
  mockBaseQueries();
  renderScreen();
  await screen.findByRole('heading', { name: 'Test Decks' });

  apiMock.getTestDeckBallotCount
    .expectRepeatedCallsWith({ precinctId: undefined })
    .resolves(20);
  userEvent.click(getButton('Print All Test Decks'));

  await screen.findByText('Print 20 test deck ballots and tally report?');

  apiMock.printTestDeck.expectCallWith({ precinctId: undefined }).resolves();
  userEvent.click(getButton('Print 20 Ballots'));

  await screen.findByText('Printing');
});

test('prints a test deck for the selected precinct', async () => {
  mockBaseQueries();
  renderScreen();
  await screen.findByRole('heading', { name: 'Test Decks' });

  const precinct = election.precincts[0];
  userEvent.click(screen.getByText(precinct.name));
  const precinctId = precinct.id;

  apiMock.getTestDeckBallotCount
    .expectRepeatedCallsWith({ precinctId })
    .resolves(5);
  userEvent.click(getButton('Print Precinct Test Deck'));

  await screen.findByText('Print 5 test deck ballots and tally report?');

  apiMock.printTestDeck.expectCallWith({ precinctId }).resolves();
  userEvent.click(getButton('Print 5 Ballots'));

  await screen.findByText('Printing');
});

test('Print All Test Decks prints all precincts even when one is selected', async () => {
  mockBaseQueries();
  renderScreen();
  await screen.findByRole('heading', { name: 'Test Decks' });

  // Selecting a precinct must not affect the "Print All Test Decks" action.
  userEvent.click(screen.getByText(election.precincts[0].name));

  apiMock.getTestDeckBallotCount
    .expectRepeatedCallsWith({ precinctId: undefined })
    .resolves(20);
  userEvent.click(getButton('Print All Test Decks'));

  await screen.findByText('Print 20 test deck ballots and tally report?');

  apiMock.printTestDeck.expectCallWith({ precinctId: undefined }).resolves();
  userEvent.click(getButton('Print 20 Ballots'));

  await screen.findByText('Printing');
});

test('Cancel closes the confirm modal without printing', async () => {
  mockBaseQueries();
  renderScreen();
  await screen.findByRole('heading', { name: 'Test Decks' });

  apiMock.getTestDeckBallotCount
    .expectRepeatedCallsWith({ precinctId: undefined })
    .resolves(20);
  userEvent.click(getButton('Print All Test Decks'));

  await screen.findByText('Print 20 test deck ballots and tally report?');
  userEvent.click(getButton('Cancel'));

  expect(
    screen.queryByText('Print 20 test deck ballots and tally report?')
  ).not.toBeInTheDocument();
});

test('disables both buttons when the printer is not connected', async () => {
  mockBaseQueries({ printerConnected: false });
  renderScreen();

  await screen.findByRole('heading', { name: 'Test Decks' });
  expect(getButton('Print All Test Decks')).toBeDisabled();
  expect(getButton('Print Precinct Test Deck')).toBeDisabled();
});
