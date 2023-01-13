import fetchMock from 'fetch-mock';
import React from 'react';
import {
  render,
  waitFor,
  within,
  fireEvent,
  screen,
} from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import {
  electionSample,
  electionSampleDefinition,
  electionSample2Definition,
} from '@votingworks/fixtures';
import {
  fakeKiosk,
  hasTextAcrossElements,
  makeElectionManagerCard,
  makeSystemAdministratorCard,
} from '@votingworks/test-utils';
import { MemoryCard, MemoryHardware, sleep, typedAs } from '@votingworks/utils';
import { Scan } from '@votingworks/api';
import {
  ElectionManagerCardData,
  PollWorkerCardData,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { download } from './util/download';
import { App } from './app';
import { MachineConfigResponse } from './config/types';

jest.mock('./util/download');

beforeEach(() => {
  window.kiosk = undefined;
  fetchMock.config.fallbackToNetwork = true;
  fetchMock.get(
    '/central-scanner/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      canUnconfigure: false,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    })
  );
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      machineId: '0001',
      codeVersion: 'TEST',
    })
  );

  const oldWindowLocation = window.location;
  Object.defineProperty(window, 'location', {
    value: {
      ...oldWindowLocation,
      href: '/',
    },
    configurable: true,
  });
});

afterEach(() => {
  expect(fetchMock.done()).toEqual(true);
  expect(fetchMock.calls('unmatched')).toEqual([]);
});

async function authenticateWithSystemAdministratorCard(card: MemoryCard) {
  await screen.findByText('VxCentralScan is Locked');
  card.insertCard(makeSystemAdministratorCard());
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  await screen.findByText('Remove card to continue.');
  card.removeCard();
  await screen.findByText('Lock Machine');
}

async function authenticateWithElectionManagerCard(
  card: MemoryCard,
  options: { isMachineConfigured?: boolean } = {}
) {
  const isMachineConfigured = options.isMachineConfigured ?? true;

  await screen.findByText(
    isMachineConfigured
      ? 'VxCentralScan is Locked'
      : 'VxCentralScan is Not Configured'
  );
  await screen.findByText(
    isMachineConfigured
      ? 'Insert Election Manager card to unlock.'
      : 'Insert Election Manager card to configure.'
  );
  card.insertCard(
    makeElectionManagerCard(electionSampleDefinition.electionHash)
  );
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  await screen.findByText('Remove card to continue.');
  card.removeCard();
  await screen.findByText('Lock Machine');
}

test('renders without crashing', async () => {
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };
  fetchMock
    .getOnce('/central-scanner/config/election', {
      body: getElectionResponseBody,
    })
    .getOnce('/central-scanner/config/testMode', {
      body: getTestModeResponseBody,
    })
    .getOnce('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);
  await waitFor(() => fetchMock.called());
});

test('shows a "Test mode" button if the app is in Live Mode', async () => {
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: false,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };
  fetchMock
    .get('/central-scanner/config/election', { body: getElectionResponseBody })
    .get('/central-scanner/config/testMode', { body: getTestModeResponseBody })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const result = render(<App card={card} hardware={hardware} />);
  await authenticateWithElectionManagerCard(card);

  fireEvent.click(result.getByText('Admin'));

  result.getByText('Toggle to Test Mode');
});

test('shows a "Live mode" button if the app is in Test Mode', async () => {
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };
  fetchMock
    .get('/central-scanner/config/election', { body: getElectionResponseBody })
    .get('/central-scanner/config/testMode', { body: getTestModeResponseBody })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const logger = fakeLogger();

  const result = render(
    <App card={card} hardware={hardware} logger={logger} />
  );
  await authenticateWithElectionManagerCard(card);

  fireEvent.click(result.getByText('Admin'));

  result.getByText('Toggle to Live Mode');

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('clicking Scan Batch will scan a batch', async () => {
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };
  const scanBatchResponseBody: Scan.ScanBatchResponse = {
    status: 'error',
    errors: [{ type: 'scan-error', message: 'interpreter not ready' }],
  };
  fetchMock
    .get('/central-scanner/config/election', { body: getElectionResponseBody })
    .get('/central-scanner/config/testMode', { body: getTestModeResponseBody })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })
    .postOnce('/central-scanner/scan/scanBatch', {
      body: scanBatchResponseBody,
    });

  const mockAlert = jest.fn();
  window.alert = mockAlert;
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  await act(async () => {
    const { getByText } = render(<App card={card} hardware={hardware} />);
    await authenticateWithElectionManagerCard(card);
    fireEvent.click(getByText('Scan New Batch'));
  });

  expect(mockAlert).toHaveBeenCalled();
  mockAlert.mockClear();

  fetchMock.postOnce(
    '/central-scanner/scan/scanBatch',
    { body: { status: 'ok', batchId: 'foobar' } },
    { overwriteRoutes: true }
  );

  expect(mockAlert).not.toHaveBeenCalled();
});

test('clicking "Save CVRs" shows modal and makes a request to export', async () => {
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };
  const scanStatusResponseBody: Scan.GetScanStatusResponse = {
    canUnconfigure: false,
    batches: [
      {
        id: 'test-batch',
        label: 'Batch 1',
        count: 2,
        startedAt: '2021-05-13T13:19:42.353Z',
      },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
  };
  fetchMock
    .get('/central-scanner/config/election', { body: getElectionResponseBody })
    .get('/central-scanner/config/testMode', { body: getTestModeResponseBody })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })
    .getOnce(
      '/central-scanner/scan/status',
      { body: scanStatusResponseBody },
      { overwriteRoutes: true }
    );

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  const { getByText, queryByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  );
  await authenticateWithElectionManagerCard(card);
  const exportingModalText = 'No USB Drive Detected';

  await act(async () => {
    // wait for the config to load
    await sleep(500);

    fireEvent.click(getByText('Save CVRs'));
    await waitFor(() => getByText(exportingModalText));
    fireEvent.click(getByTestId('manual-export'));
    await waitFor(() => getByText('CVRs Saved'));
    fireEvent.click(getByText('Cancel'));
  });

  expect(queryByText(exportingModalText)).toEqual(null);
  expect(download).toHaveBeenCalledWith(
    expect.stringContaining(
      '/central-scanner/scan/export?filename=TEST__machine_0001__'
    )
  );
});

// bad cleanup
test('configuring election from usb ballot package works end to end', async () => {
  const getTestModeConfigResponse: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponse: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };
  fetchMock
    .get('/central-scanner/config/election', { body: 'null' })
    .get('/central-scanner/config/testMode', {
      body: getTestModeConfigResponse,
    })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponse,
    })
    .patchOnce('/central-scanner/config/testMode', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .patchOnce('/central-scanner/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  );
  await authenticateWithElectionManagerCard(card, {
    isMachineConfigured: false,
  });

  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  await act(async () => {
    // wait for the config to load
    await sleep(500);
    getByText('Load Election Configuration');
  });

  fetchMock
    .get('/central-scanner/config/election', electionSampleDefinition, {
      overwriteRoutes: true,
    })
    .getOnce(
      '/central-scanner/config/testMode',
      { status: 'ok', testMode: true },
      { overwriteRoutes: true }
    );

  fireEvent.change(getByTestId('manual-upload-input'), {
    target: {
      files: [new File([JSON.stringify(electionSample)], 'file.json')],
    },
  });

  await act(async () => {
    await sleep(500);
    getByText('Successfully Configured');
  });

  fireEvent.click(getByText('Close'));
  getByText('No ballots have been scanned.');

  getByText('General Election');
  getByText(/Franklin County,/);
  getByText(/State of Hamilton/);
  screen.getByText(hasTextAcrossElements('Machine ID0001'));

  // Unconfigure Machine
  fetchMock
    .getOnce('/central-scanner/config/election', new Response('null'), {
      overwriteRoutes: true,
    })
    .deleteOnce('/central-scanner/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    });
  fireEvent.click(getByText('Admin'));
  getByText('Admin Actions');
  fireEvent.click(getByText('Delete Election Data from VxCentralScan'));
  getByText('Delete all election data?');
  fireEvent.click(getByText('Yes, Delete Election Data'));
  getByText('Are you sure?');
  fireEvent.click(getByText('I am sure. Delete all election data.'));
  getByText('Deleting election data');
  await act(async () => {
    await sleep(2000);
    getByText('Load Election Configuration');
  });
});

test('authentication works', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  hardware.setBatchScannerConnected(false);
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };

  fetchMock
    .get('/central-scanner/config/election', { body: getElectionResponseBody })
    .get('/central-scanner/config/testMode', { body: getTestModeResponseBody })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  render(<App card={card} hardware={hardware} />);

  await screen.findByText('VxCentralScan is Locked');
  const electionManagerCard: ElectionManagerCardData = {
    t: 'election_manager',
    h: electionSampleDefinition.electionHash,
    p: '123456',
  };
  const pollWorkerCard: PollWorkerCardData = {
    t: 'poll_worker',
    h: electionSampleDefinition.electionHash,
  };

  // Disconnect card reader
  act(() => {
    hardware.setCardReaderConnected(false);
  });
  await screen.findByText('Card Reader Not Detected');
  act(() => {
    hardware.setCardReaderConnected(true);
  });
  await screen.findByText('VxCentralScan is Locked');

  // Insert an election manager card and enter the wrong code.
  card.insertCard(electionManagerCard);
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  await screen.findByText('Invalid code. Please try again.');

  // Remove card and insert a pollworker card.
  card.removeCard();
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('VxCentralScan is Locked');
  card.insertCard(pollWorkerCard);
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('Invalid Card');
  card.removeCard();
  await act(async () => {
    await sleep(100);
  });

  // Insert election manager card and enter correct code.
  card.insertCard(electionManagerCard);
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));

  // 'Remove Card' screen is shown after successful authentication.
  await screen.findByText('Remove card to continue.');
  screen.getByText('VxCentralScan Unlocked');

  // Machine is unlocked when card removed
  card.removeCard();
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('No Scanner');

  // The card and other cards can be inserted with no impact.
  card.insertCard(electionManagerCard);
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('No Scanner');
  card.removeCard();
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('No Scanner');
  card.insertCard(pollWorkerCard);
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('No Scanner');
  card.removeCard();
  await act(async () => {
    await sleep(100);
  });

  // Lock the machine
  fireEvent.click(screen.getByText('Lock Machine'));
  await screen.findByText('VxCentralScan is Locked');
});

test('system administrator can log in and unconfigure machine', async () => {
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    {
      status: 'ok',
    };
  const deleteElectionConfigResponseBody: Scan.DeleteElectionConfigResponse = {
    status: 'ok',
  };

  fetchMock
    .get('/central-scanner/config/election', { body: getElectionResponseBody })
    .get('/central-scanner/config/testMode', { body: getTestModeResponseBody })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })
    .delete('/central-scanner/config/election?ignoreBackupRequirement=true', {
      body: deleteElectionConfigResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);

  await authenticateWithSystemAdministratorCard(card);

  screen.getByRole('button', { name: 'Reboot from USB' });
  screen.getByRole('button', { name: 'Reboot to BIOS' });
  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Yes, Delete Election Data',
    })
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  userEvent.click(screen.getByText('Lock Machine'));
  await screen.findByText('VxCentralScan is Locked');
});

test('election manager cannot auth onto machine with different election hash', async () => {
  const getElectionResponseBody: Scan.GetElectionConfigResponse =
    electionSampleDefinition;
  const getTestModeResponseBody: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
    { status: 'ok' };

  fetchMock
    .get('/central-scanner/config/election', { body: getElectionResponseBody })
    .get('/central-scanner/config/testMode', { body: getTestModeResponseBody })
    .get('/central-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);

  await screen.findByText('VxCentralScan is Locked');
  card.insertCard(
    makeElectionManagerCard(electionSample2Definition.electionHash)
  );
  await screen.findByText(
    'The inserted Election Manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.'
  );
});
