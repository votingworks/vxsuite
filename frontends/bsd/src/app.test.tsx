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
} from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeKiosk,
  fakeSystemAdministratorUser,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import { MemoryHardware } from '@votingworks/utils';
import { typedAs, sleep } from '@votingworks/basics';
import { Scan } from '@votingworks/api';
import { ElectionDefinition } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { fakeLogger } from '@votingworks/logging';
import { download } from './util/download';
import { App } from './app';
import { MachineConfigResponse } from './config/types';
import { createMockApiClient, MockApiClient, setAuthStatus } from '../test/api';

jest.mock('./util/download');

let mockApiClient: MockApiClient;

beforeEach(() => {
  window.kiosk = undefined;

  mockApiClient = createMockApiClient();

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
  mockApiClient.assertComplete();
  expect(fetchMock.done()).toEqual(true);
  expect(fetchMock.calls('unmatched')).toEqual([]);
});

export async function authenticateAsSystemAdministrator(
  lockScreenText = 'VxCentralScan is Locked'
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText(lockScreenText);

  setAuthStatus(mockApiClient, {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  });
  await screen.findByText('Lock Machine');
}

export async function authenticateAsElectionManager(
  electionDefinition: ElectionDefinition,
  lockScreenText = 'VxCentralScan is Locked'
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText(lockScreenText);

  setAuthStatus(mockApiClient, {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
  });
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

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={mockApiClient} hardware={hardware} />);
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

  const hardware = MemoryHardware.buildStandard();
  const result = render(<App apiClient={mockApiClient} hardware={hardware} />);
  await authenticateAsElectionManager(electionSampleDefinition);

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

  const hardware = MemoryHardware.buildStandard();
  const logger = fakeLogger();

  const result = render(
    <App apiClient={mockApiClient} hardware={hardware} logger={logger} />
  );
  await authenticateAsElectionManager(electionSampleDefinition);

  fireEvent.click(result.getByText('Admin'));

  result.getByText('Toggle to Live Mode');
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
  const hardware = MemoryHardware.buildStandard();

  await act(async () => {
    const { getByText } = render(
      <App apiClient={mockApiClient} hardware={hardware} />
    );
    await authenticateAsElectionManager(electionSampleDefinition);
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

  const hardware = MemoryHardware.buildStandard();

  const { getByText, queryByText, getByTestId } = render(
    <App apiClient={mockApiClient} hardware={hardware} />
  );
  await authenticateAsElectionManager(electionSampleDefinition);
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

  const hardware = MemoryHardware.buildStandard();
  const { getByText, getByTestId } = render(
    <App apiClient={mockApiClient} hardware={hardware} />
  );
  await authenticateAsElectionManager(
    electionSampleDefinition,
    'VxCentralScan is Not Configured'
  );

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
    .getOnce('/central-scanner/config/election', JSON.stringify(null), {
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

  render(<App apiClient={mockApiClient} hardware={hardware} />);

  await screen.findByText('VxCentralScan is Locked');

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
  setAuthStatus(mockApiClient, {
    status: 'checking_passcode',
    user: fakeElectionManagerUser(electionSampleDefinition),
  });
  mockApiClient.checkPin.expectCallWith({ pin: '111111' }).resolves();
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  setAuthStatus(mockApiClient, {
    status: 'checking_passcode',
    user: fakeElectionManagerUser(electionSampleDefinition),
    wrongPasscodeEnteredAt: new Date(),
  });
  await screen.findByText('Invalid code. Please try again.');

  // Remove card and insert an invalid card, e.g. a pollworker card.
  setAuthStatus(mockApiClient, {
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await screen.findByText('VxCentralScan is Locked');
  setAuthStatus(mockApiClient, {
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  await screen.findByText('Invalid Card');
  setAuthStatus(mockApiClient, {
    status: 'logged_out',
    reason: 'machine_locked',
  });

  // Insert election manager card and enter correct code.
  setAuthStatus(mockApiClient, {
    status: 'checking_passcode',
    user: fakeElectionManagerUser(electionSampleDefinition),
  });
  mockApiClient.checkPin.expectCallWith({ pin: '123456' }).resolves();
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));

  // 'Remove Card' screen is shown after successful authentication.
  setAuthStatus(mockApiClient, {
    status: 'remove_card',
    user: fakeElectionManagerUser(electionSampleDefinition),
  });
  await screen.findByText('Remove card to continue.');
  screen.getByText('VxCentralScan Unlocked');

  // Machine is unlocked when card removed
  setAuthStatus(mockApiClient, {
    status: 'logged_in',
    user: fakeElectionManagerUser(electionSampleDefinition),
  });
  await screen.findByText('No Scanner');

  // Lock the machine
  mockApiClient.logOut.expectCallWith().resolves();
  fireEvent.click(screen.getByText('Lock Machine'));
  setAuthStatus(mockApiClient, {
    status: 'logged_out',
    reason: 'machine_locked',
  });
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

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={mockApiClient} hardware={hardware} />);

  await authenticateAsSystemAdministrator();

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
  fetchMock.get(
    '/central-scanner/config/election',
    { body: 'null' },
    { overwriteRoutes: false }
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
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

  const hardware = MemoryHardware.buildStandard();
  render(<App apiClient={mockApiClient} hardware={hardware} />);

  await screen.findByText('VxCentralScan is Locked');
  setAuthStatus(mockApiClient, {
    status: 'logged_out',
    reason: 'election_manager_wrong_election',
  });
  await screen.findByText(
    'The inserted Election Manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.'
  );
});
