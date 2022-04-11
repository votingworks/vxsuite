import fetchMock from 'fetch-mock';
import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import {
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import fileDownload from 'js-file-download';
import { fakeKiosk } from '@votingworks/test-utils';
import { MemoryCard, MemoryHardware, sleep, typedAs } from '@votingworks/utils';
import {
  GetElectionConfigResponse,
  GetMarkThresholdOverridesConfigResponse,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
  ScanBatchResponse,
  ScannerStatus,
} from '@votingworks/types/api/services/scan';
import { AdminCardData, PollworkerCardData } from '@votingworks/types';
import { App } from './app';
import { hasTextAcrossElements } from '../test/util/has_text_across_elements';
import { MachineConfigResponse } from './config/types';

jest.mock('js-file-download');

beforeEach(() => {
  fetchMock.config.fallbackToNetwork = true;
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
      scanner: ScannerStatus.Unknown,
    })
  );
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      machineId: '0001',
      codeVersion: 'TEST',
      bypassAuthentication: false,
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
  expect(fetchMock.done()).toBe(true);
  expect(fetchMock.calls('unmatched')).toEqual([]);
});

async function authenticateWithAdminCard(card: MemoryCard) {
  // Machine should be locked
  await screen.findByText('VxCentralScan is Locked');
  card.insertCard({
    t: 'admin',
    h: electionSampleDefinition.electionHash,
    p: '123456',
  });
  await act(async () => await sleep(100));
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));
  await act(async () => await sleep(100));
}

test('renders without crashing', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition;
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  };
  fetchMock
    .getOnce('/config/election', { body: getElectionResponseBody })
    .getOnce('/config/testMode', { body: getTestModeResponseBody })
    .getOnce('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);
  await waitFor(() => fetchMock.called());
});

test('shows a "Test mode" button if the app is in Live Mode', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition;
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: false,
  };
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  };
  fetchMock
    .get('/config/election', { body: getElectionResponseBody })
    .get('/config/testMode', { body: getTestModeResponseBody })
    .get('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const result = render(<App card={card} hardware={hardware} />);
  await authenticateWithAdminCard(card);

  fireEvent.click(result.getByText('Admin'));

  result.getByText('Toggle to Test Mode');
});

test('shows a "Live mode" button if the app is in Test Mode', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition;
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  };
  fetchMock
    .get('/config/election', { body: getElectionResponseBody })
    .get('/config/testMode', { body: getTestModeResponseBody })
    .get('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  const result = render(<App card={card} hardware={hardware} />);
  await authenticateWithAdminCard(card);

  fireEvent.click(result.getByText('Admin'));

  result.getByText('Toggle to Live Mode');
});

test('clicking Scan Batch will scan a batch', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition;
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  };
  const scanBatchResponseBody: ScanBatchResponse = {
    status: 'error',
    errors: [{ type: 'scan-error', message: 'interpreter not ready' }],
  };
  fetchMock
    .get('/config/election', { body: getElectionResponseBody })
    .get('/config/testMode', { body: getTestModeResponseBody })
    .get('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })
    .postOnce('/scan/scanBatch', { body: scanBatchResponseBody });

  const mockAlert = jest.fn();
  window.alert = mockAlert;
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  await act(async () => {
    const { getByText } = render(<App card={card} hardware={hardware} />);
    await authenticateWithAdminCard(card);
    fireEvent.click(getByText('Scan New Batch'));
  });

  expect(mockAlert).toHaveBeenCalled();
  mockAlert.mockClear();

  fetchMock.postOnce(
    '/scan/scanBatch',
    { body: { status: 'ok', batchId: 'foobar' } },
    { overwriteRoutes: true }
  );

  expect(mockAlert).not.toHaveBeenCalled();
});

test('clicking export shows modal and makes a request to export', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition;
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  };
  const scanStatusResponseBody: GetScanStatusResponse = {
    batches: [
      {
        id: 'test-batch',
        label: 'Batch 1',
        count: 2,
        startedAt: '2021-05-13T13:19:42.353Z',
      },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
    scanner: ScannerStatus.Unknown,
  };
  fetchMock
    .get('/config/election', { body: getElectionResponseBody })
    .get('/config/testMode', { body: getTestModeResponseBody })
    .get('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })
    .getOnce(
      '/scan/status',
      { body: scanStatusResponseBody },
      { overwriteRoutes: true }
    )
    .postOnce('/scan/export', {
      body: '',
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();

  const { getByText, queryByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  );
  await authenticateWithAdminCard(card);
  const exportingModalText = 'No USB Drive Detected';

  await act(async () => {
    // wait for the config to load
    await sleep(500);

    fireEvent.click(getByText('Export'));
    await waitFor(() => getByText(exportingModalText));
    fireEvent.click(getByTestId('manual-export'));
    await waitFor(() => getByText('Download Complete'));
    fireEvent.click(getByText('Cancel'));
  });

  expect(fetchMock.called('/scan/export')).toBe(true);
  expect(queryByText(exportingModalText)).toBe(null);
  expect(fileDownload).toHaveBeenCalled();
});

test('configuring election from usb ballot package works end to end', async () => {
  const getTestModeConfigResponse: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponse: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  };
  fetchMock
    .get('/config/election', { body: 'null' })
    .get('/config/testMode', { body: getTestModeConfigResponse })
    .get('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponse,
    })
    .patchOnce('/config/testMode', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .patchOnce('/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const { getByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  );
  await authenticateWithAdminCard(card);

  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  await act(async () => {
    // wait for the config to load
    await sleep(500);
    getByText('Load Election Configuration');
  });

  fetchMock
    .get('/config/election', electionSampleDefinition, {
      overwriteRoutes: true,
    })
    .getOnce(
      '/config/testMode',
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
  getByText(/Franklin County, State of Hamilton/);
  screen.getByText(hasTextAcrossElements('Machine ID0001'));

  // Unconfigure Machine
  fetchMock
    .getOnce('/config/election', new Response('null'), {
      overwriteRoutes: true,
    })
    .deleteOnce('/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    });
  fireEvent.click(getByText('Admin'));
  getByText('Admin Actions');
  fireEvent.click(getByText('Delete Election Data from VxCentralScan…'));
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
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition;
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  };

  fetchMock
    .get('/config/election', { body: getElectionResponseBody })
    .get('/config/testMode', { body: getTestModeResponseBody })
    .get('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    });

  render(<App card={card} hardware={hardware} />);

  await screen.findByText('VxCentralScan is Locked');
  const adminCard: AdminCardData = {
    t: 'admin',
    h: electionSampleDefinition.electionHash,
    p: '123456',
  };
  const pollWorkerCard: PollworkerCardData = {
    t: 'pollworker',
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

  // Insert an admin card and enter the wrong code.
  card.insertCard(adminCard);
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

  // Insert admin card and enter correct code.
  card.insertCard(adminCard);
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

  // Machine should be unlocked
  await screen.findByText('No Scanner');

  // The card can be removed and the screen will stay unlocked
  card.removeCard();
  await act(async () => {
    await sleep(100);
  });
  await screen.findByText('No Scanner');

  // The card and other cards can be inserted with no impact.
  card.insertCard(adminCard);
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
