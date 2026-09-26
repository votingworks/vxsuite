import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { HP_4001_PRINTER_CONFIG } from '@votingworks/printing';
import {
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  LanguageCode,
} from '@votingworks/types';
import { err, ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library.js';
import { PRINT_HANDOFF_MODAL_LINGER_SECONDS } from '../constants.js';
import {
  type ApiMock,
  ApiMockProvider,
  createApiMock,
} from '../../test/mock_api_client.js';
import { PrintScreen } from './print_screen.js';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

// This polling place covers only the North Lincoln precinct (id '23').
const SINGLE_PRECINCT_POLLING_PLACE_ID = '23-polling-place';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
  vi.useRealTimers();
});

function mockBaseQueries({
  pollingPlaceId = null,
}: { pollingPlaceId?: string | null } = {}) {
  apiMock.getDeviceStatuses.expectRepeatedCallsWith().resolves({
    usbDrive: { status: 'no_drive' },
    printer: { connected: true, config: HP_4001_PRINTER_CONFIG },
  });
  apiMock.getElectionRecord.expectCallWith().resolves({
    electionDefinition,
    electionPackageHash: 'test-hash',
  });
  apiMock.getMachineConfig.expectCallWith().resolves({
    machineId: 'test-machine',
    codeVersion: 'test-version',
  });
  apiMock.getPollingPlaceId.expectCallWith().resolves(pollingPlaceId);
  apiMock.getSystemSettings.expectCallWith().resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getTestMode.expectCallWith().resolves(true);
}

function renderScreen({
  isElectionManagerAuth,
}: {
  isElectionManagerAuth: boolean;
}) {
  return render(
    <ApiMockProvider apiMock={apiMock}>
      <MemoryRouter initialEntries={['/print']}>
        <PrintScreen isElectionManagerAuth={isElectionManagerAuth} />
      </MemoryRouter>
    </ApiMockProvider>
  );
}

test('poll workers only see precincts for the configured polling place', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  renderScreen({ isElectionManagerAuth: false });

  await screen.findByRole('option', { name: 'North Lincoln' });
  expect(
    screen.queryByRole('option', { name: 'South Lincoln' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'East Lincoln' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'West Lincoln' })
  ).not.toBeInTheDocument();
});

test('election managers see all precincts regardless of the configured polling place', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  renderScreen({ isElectionManagerAuth: true });

  await screen.findByRole('option', { name: 'North Lincoln' });
  screen.getByRole('option', { name: 'South Lincoln' });
  screen.getByRole('option', { name: 'East Lincoln' });
  screen.getByRole('option', { name: 'West Lincoln' });
});

const PRINT_JOB_ID = 1;

function expectPrintBallot() {
  apiMock.printBallot
    .expectCallWith({
      precinctId: '23',
      splitId: '',
      partyId: '',
      languageCode: LanguageCode.ENGLISH,
      ballotType: BallotType.Precinct,
      copies: 1,
    })
    .resolves(PRINT_JOB_ID);
}

async function selectPrecinctAndPrint() {
  userEvent.click(await screen.findByRole('option', { name: 'North Lincoln' }));
  userEvent.click(screen.getByRole('button', { name: /Print Ballot/ }));
}

test('shows a dismissable modal when the print job fails', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  expectPrintBallot();
  apiMock.getPrintJobStatus
    .expectRepeatedCallsWith({ jobId: PRINT_JOB_ID })
    .resolves(ok({ outcome: 'failed', reason: 'Printer is out of paper.' }));
  renderScreen({ isElectionManagerAuth: false });

  await selectPrecinctAndPrint();

  await screen.findByRole('heading', { name: 'Ballot Not Printed' });
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
  screen.getByText('Printer is out of paper.');
  userEvent.click(screen.getByRole('button', { name: 'Close' }));

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('heading', { name: 'Ballot Not Printed' })
    ).not.toBeInTheDocument();
  });
});

test('keeps the printing modal up briefly after handoff, then closes it', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  expectPrintBallot();
  apiMock.getPrintJobStatus
    .expectRepeatedCallsWith({ jobId: PRINT_JOB_ID })
    .resolves(ok({ outcome: 'sent-to-printer' }));
  renderScreen({ isElectionManagerAuth: false });

  await selectPrecinctAndPrint();

  await screen.findByText('Printing');
  await vi.advanceTimersByTimeAsync(
    PRINT_HANDOFF_MODAL_LINGER_SECONDS * 1000 - 100
  );
  screen.getByText('Printing');

  await vi.advanceTimersByTimeAsync(100);
  await vi.waitFor(() => {
    expect(screen.queryByText('Printing')).not.toBeInTheDocument();
  });
  expect(
    screen.queryByRole('heading', { name: 'Ballot Not Printed' })
  ).not.toBeInTheDocument();
});

test('keeps the printing modal up while the job is in progress', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  expectPrintBallot();
  apiMock.getPrintJobStatus
    .expectRepeatedCallsWith({ jobId: PRINT_JOB_ID })
    .resolves(ok({ outcome: 'in-progress' }));
  renderScreen({ isElectionManagerAuth: false });

  await selectPrecinctAndPrint();

  await screen.findByText('Printing');
  await vi.advanceTimersByTimeAsync(5000);
  screen.getByText('Printing');
});

test('treats an unknown print job as a failure', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  expectPrintBallot();
  apiMock.getPrintJobStatus
    .expectRepeatedCallsWith({ jobId: PRINT_JOB_ID })
    .resolves(err(new Error('no status tracked for print job 1')));
  renderScreen({ isElectionManagerAuth: false });

  await selectPrecinctAndPrint();

  await screen.findByRole('heading', { name: 'Ballot Not Printed' });
  expect(
    screen.queryByText('no status tracked for print job 1')
  ).not.toBeInTheDocument();
});

function mockChangingDeviceStatuses() {
  apiMock.getDeviceStatuses.reset();
  let batteryLevel = 0.9;
  function getDeviceStatuses() {
    batteryLevel -= 0.0001;
    return Promise.resolve({
      usbDrive: { status: 'no_drive' },
      printer: { connected: true, config: HP_4001_PRINTER_CONFIG },
      battery: { level: batteryLevel, discharging: true },
    });
  }
  Object.assign(apiMock, { getDeviceStatuses });
}

test('print all ballot styles closes its modal while device statuses keep changing', async () => {
  mockBaseQueries({ pollingPlaceId: SINGLE_PRECINCT_POLLING_PLACE_ID });
  mockChangingDeviceStatuses();
  apiMock.getDistinctBallotStylesCount
    .expectRepeatedCallsWith({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
    })
    .resolves(2);
  apiMock.printAllBallotStyles
    .expectCallWith({
      ballotType: BallotType.Precinct,
      copiesPerStyle: 1,
      languageCode: LanguageCode.ENGLISH,
    })
    .resolves(ok(PRINT_JOB_ID));
  apiMock.getPrintJobStatus
    .expectRepeatedCallsWith({ jobId: PRINT_JOB_ID })
    .resolves(ok({ outcome: 'sent-to-printer' }));
  renderScreen({ isElectionManagerAuth: true });

  userEvent.click(
    await screen.findByRole('button', { name: 'Print All Ballot Styles' })
  );
  userEvent.click(
    await screen.findByRole('button', { name: /Print 2 Ballot Styles/ })
  );

  await screen.findByText('Printing');
  await vi.advanceTimersByTimeAsync(
    PRINT_HANDOFF_MODAL_LINGER_SECONDS * 1000 + 500
  );
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});
