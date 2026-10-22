import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mocked,
  onTestFinished,
  test,
  vi,
} from 'vitest';
import {
  cleanup,
  fireEvent,
  render as renderWithoutTheme,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { assertDefined, deferred } from '@votingworks/basics';
import { userEvent } from '@testing-library/user-event';
import {
  createMockClient,
  type MockClient,
} from '@votingworks/grout-test-utils';
import type { Api, DevDockUsbDriveInfo } from '@votingworks/dev-dock-backend';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  mockSystemAdministratorUser,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockKiosk,
} from '@votingworks/test-utils';
import type { CardStatus } from '@votingworks/auth';
import type { PrinterConfig } from '@votingworks/types';
import { makeRender } from '@votingworks/ui/test-utils';
import { DevDock } from './dev_dock.js';

export const render = makeRender(onTestFinished);

const mockDiskPath = '/dev/sdb' as DevDockUsbDriveInfo['diskPath'];

const noCardStatus: CardStatus = {
  status: 'no_card',
};
const systemAdminCardStatus: CardStatus = {
  status: 'ready',
  cardDetails: {
    user: mockSystemAdministratorUser(),
  },
};
const electionManagerCardStatus: CardStatus = {
  status: 'ready',
  cardDetails: {
    user: mockElectionManagerUser(),
  },
};
const pollWorkerCardStatus: CardStatus = {
  status: 'ready',
  cardDetails: {
    user: mockPollWorkerUser(),
    hasPin: false,
  },
};

const mockPrinterConfig: PrinterConfig = {
  label: 'mock',
  vendorId: 0,
  productId: 0,
  baseDeviceUri: 'mock://',
  ppd: 'mock.ppd',
  supportsIpp: false,
};

const featureFlagMock = getFeatureFlagMock();
vi.mock('@votingworks/utils', async () => ({
  ...(await vi.importActual('@votingworks/utils')),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let mockApiClient: MockClient<Api>;
let kiosk: Mocked<KioskBrowser.Kiosk>;

beforeEach(() => {
  mockApiClient = createMockClient<Api>();
  mockApiClient.getMockSpec.expectCallWith().resolves({});
  mockApiClient.getDockSide.expectCallWith().resolves('top');
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  mockApiClient.getUsbDriveStatus
    .expectRepeatedCallsWith({ purpose: 'data' })
    .resolves({ diskPath: mockDiskPath, fstype: 'exfat', status: 'removed' });
  mockApiClient.getAvailableElections.expectRepeatedCallsWith().resolves([
    {
      title: 'electionGeneral',
      inputPath: './libs/fixtures/data/electionGeneral/election.json',
    },
    {
      title: 'electionFamousNames2021',
      inputPath: './libs/fixtures/data/electionFamousNames2021/election.json',
    },
    {
      title: 'electionTwoPartyPrimary',
      inputPath: './libs/fixtures/data/electionTwoPartyPrimary/election.json',
    },
  ]);
  mockApiClient.getElection.expectCallWith().resolves({
    title: 'Sample General Election',
    inputPath: './libs/fixtures/data/electionGeneral/election.json',
    resolvedPath: '/full-path',
    arePollWorkerCardPinsEnabled: false,
    isElectionPackage: false,
  });
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_DEV_DOCK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CARDS
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  kiosk = mockKiosk(vi.fn);
  window.kiosk = kiosk;
});

afterEach(() => {
  mockApiClient.assertComplete();
  featureFlagMock.resetFeatureFlags();
});

test('renders nothing if dev dock is disabled', () => {
  mockApiClient.getCardStatus.reset();
  mockApiClient.getElection.reset();
  mockApiClient.getUsbDriveStatus.reset();
  mockApiClient.getMockSpec.reset();
  mockApiClient.getDockSide.reset();
  mockApiClient.getAvailableElections.reset();
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_DEV_DOCK
  );
  const { container } = renderDock(mockApiClient);
  expect(container).toBeEmptyDOMElement();
});

test('card mock controls', async () => {
  renderDock(mockApiClient);

  // Card controls should enable once status loads
  const systemAdminControl = await screen.findByRole('button', {
    name: 'System Admin',
  });
  await waitFor(() => {
    expect(systemAdminControl).toBeEnabled();
  });
  const electionManagerControl = screen.getByRole('button', {
    name: 'Election Manager',
  });
  const pollWorkerControl = screen.getByRole('button', {
    name: 'Poll Worker',
  });
  expect(electionManagerControl).toBeEnabled();
  expect(pollWorkerControl).toBeEnabled();

  // Insert system admin card
  mockApiClient.insertCard
    .expectCallWith({ role: 'system_administrator' })
    .resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(systemAdminCardStatus);
  await userEvent.click(systemAdminControl);
  await waitFor(() => {
    expect(electionManagerControl).toBeDisabled();
    expect(pollWorkerControl).toBeDisabled();
  });

  // Remove system admin card
  mockApiClient.removeCard.expectCallWith().resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  await userEvent.click(systemAdminControl);
  await waitFor(() => {
    expect(electionManagerControl).toBeEnabled();
    expect(pollWorkerControl).toBeEnabled();
  });

  // Insert election manager card
  mockApiClient.insertCard
    .expectCallWith({ role: 'election_manager' })
    .resolves();
  mockApiClient.getCardStatus
    .expectCallWith()
    .resolves(electionManagerCardStatus);
  await userEvent.click(electionManagerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeDisabled();
    expect(pollWorkerControl).toBeDisabled();
  });

  // Remove election manager card
  mockApiClient.removeCard.expectCallWith().resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  await userEvent.click(electionManagerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeEnabled();
    expect(pollWorkerControl).toBeEnabled();
  });

  // Insert poll worker card
  mockApiClient.insertCard.expectCallWith({ role: 'poll_worker' }).resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(pollWorkerCardStatus);
  await userEvent.click(pollWorkerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeDisabled();
    expect(electionManagerControl).toBeDisabled();
  });

  // Remove poll worker card
  mockApiClient.removeCard.expectCallWith().resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  await userEvent.click(pollWorkerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeEnabled();
    expect(electionManagerControl).toBeEnabled();
  });
});

test('disabled card mock controls if card mocks are disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CARDS
  );
  renderDock(mockApiClient);

  await screen.findByText('Smart card mocks disabled');
  const systemAdminControl = screen.getByRole('button', {
    name: 'System Admin',
  });
  const electionManagerControl = screen.getByRole('button', {
    name: 'Election Manager',
  });
  const pollWorkerControl = screen.getByRole('button', {
    name: 'Poll Worker',
  });
  // Since the controls are disabled until the card status loads, we need to
  // wait for the API call to complete before checking that the controls are
  // still disabled.
  await waitFor(() => mockApiClient.assertComplete());
  expect(systemAdminControl).toBeDisabled();
  expect(electionManagerControl).toBeDisabled();
  expect(pollWorkerControl).toBeDisabled();
});

test('election selector', async () => {
  renderDock(mockApiClient);
  const electionSelector = await screen.findByRole('combobox');
  await waitFor(() => {
    expect(electionSelector).toHaveValue(
      './libs/fixtures/data/electionGeneral/election.json'
    );
  });

  mockApiClient.setElection
    .expectCallWith({
      inputPath: './libs/fixtures/data/electionFamousNames2021/election.json',
    })
    .resolves();
  mockApiClient.getElection.expectCallWith().resolves({
    title: 'Famous Names',
    inputPath: './libs/fixtures/data/electionFamousNames2021/election.json',
    resolvedPath: '/full-path',
    arePollWorkerCardPinsEnabled: false,
    isElectionPackage: false,
  });
  await userEvent.selectOptions(
    electionSelector,
    screen.getByRole('option', { name: /electionFamousNames2021/ })
  );
  await waitFor(() => {
    expect(electionSelector).toHaveValue(
      './libs/fixtures/data/electionFamousNames2021/election.json'
    );
  });
});

test('USB drive controls', async () => {
  renderDock(mockApiClient);
  const usbDriveControl = await screen.findByRole('button', {
    name: 'USB Drive /dev/sdb',
  });
  await waitFor(() => expect(usbDriveControl).toBeEnabled());
  expect(
    screen.queryByRole('button', { name: 'USB Drive /dev/sdc' })
  ).toBeNull();

  mockApiClient.insertUsbDrive.expectCallWith({ purpose: 'data' }).resolves();
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'data' })
    .resolves({ diskPath: mockDiskPath, fstype: 'exfat', status: 'inserted' });
  await userEvent.click(usbDriveControl);
  await waitFor(() => mockApiClient.assertComplete());

  mockApiClient.removeUsbDrive.expectCallWith({ purpose: 'data' }).resolves();
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'data' })
    .resolves({ diskPath: mockDiskPath, fstype: 'exfat', status: 'removed' });
  await userEvent.click(usbDriveControl);
  await waitFor(() => mockApiClient.assertComplete());

  const clearUsbDriveButton = screen.getByRole('button', {
    name: 'Clear',
  });
  mockApiClient.clearUsbDrive.expectCallWith({ purpose: 'data' }).resolves();
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'data' })
    .resolves({ diskPath: mockDiskPath, fstype: 'exfat', status: 'removed' });
  await userEvent.click(clearUsbDriveButton);
  await waitFor(() => mockApiClient.assertComplete());
});

test('disabled USB drive controls if USB drive mocks are disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  renderDock(mockApiClient);

  await screen.findByText('USB mock disabled');
  const usbDriveControl = screen.getByRole('button', {
    name: 'USB Drive /dev/sdb',
  });
  const clearUsbDriveButton = screen.getByRole('button', {
    name: 'Clear',
  });
  // Since the controls are disabled until the USB drive status loads, we need to
  // wait for the API call to complete before checking that the controls are
  // still disabled.
  await waitFor(() => mockApiClient.assertComplete());
  expect(usbDriveControl).toBeDisabled();
  expect(clearUsbDriveButton).toBeDisabled();
});

test('screenshot flow', async () => {
  renderDock(mockApiClient);
  const screenshotButton = await screen.findByRole('button', {
    name: 'Capture Screenshot',
  });

  document.title = 'VotingWorks VxAdmin';
  mockApiClient.saveScreenshotForApp
    .expectCallWith({
      fileName: 'test.png',
      screenshot: Uint8Array.of(),
    })
    .resolves();

  await userEvent.click(screenshotButton);

  await screen.findByText('Save Screenshot');
  const screenshotFileNameInput = screen.getByRole('textbox', {
    name: 'Screenshot File Name',
  });
  await userEvent.clear(screenshotFileNameInput);
  await userEvent.type(screenshotFileNameInput, 'test.png');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('Enter saves the screenshot from the file name input', async () => {
  renderDock(mockApiClient);
  document.title = 'VotingWorks VxAdmin';
  await userEvent.click(
    await screen.findByRole('button', { name: 'Capture Screenshot' })
  );
  await screen.findByText('Save Screenshot');

  const fileNameInput = screen.getByRole('textbox', {
    name: 'Screenshot File Name',
  });
  await userEvent.clear(fileNameInput);
  await userEvent.type(fileNameInput, ' test.png ');
  mockApiClient.saveScreenshotForApp
    .expectCallWith({ fileName: 'test.png', screenshot: Uint8Array.of() })
    .resolves();
  await userEvent.keyboard('{Enter}');

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('Enter on a focused modal button activates that button', async () => {
  renderDock(mockApiClient);
  document.title = 'VotingWorks VxAdmin';
  await userEvent.click(
    await screen.findByRole('button', { name: 'Capture Screenshot' })
  );
  await screen.findByText('Save Screenshot');

  screen.getByRole('button', { name: 'Cancel' }).focus();
  await userEvent.keyboard('{Enter}');

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('Cmd+K starts screenshot flow', async () => {
  renderDock(mockApiClient);
  await screen.findByRole('button', { name: 'Capture Screenshot' });

  document.title = 'VotingWorks VxAdmin';
  await userEvent.keyboard('{Meta>}k{/Meta}');
  await screen.findByText('Save Screenshot');
});

test('Esc dismisses screenshot modal', async () => {
  renderDock(mockApiClient);
  const screenshotButton = await screen.findByRole('button', {
    name: 'Capture Screenshot',
  });

  document.title = 'VotingWorks VxAdmin';
  await userEvent.click(screenshotButton);
  await screen.findByText('Save Screenshot');

  await userEvent.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('screenshot modal renders without an outer ThemeProvider', async () => {
  onTestFinished(cleanup);
  renderWithoutTheme(<DevDock apiClient={mockApiClient} enableAccessibleNav />);
  const screenshotButton = await screen.findByRole('button', {
    name: 'Capture Screenshot',
  });

  document.title = 'VotingWorks VxAdmin';
  await userEvent.click(screenshotButton);
  await screen.findByText('Save Screenshot');

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('Save button is auto-focused when screenshot modal opens', async () => {
  renderDock(mockApiClient);
  const screenshotButton = await screen.findByRole('button', {
    name: 'Capture Screenshot',
  });

  document.title = 'VotingWorks VxAdmin';
  await userEvent.click(screenshotButton);
  await screen.findByText('Save Screenshot');

  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('printer mock control', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );

  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec
    .expectCallWith()
    .resolves({ printerConfig: mockPrinterConfig });
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: false,
  });

  renderDock(mockApiClient);
  const printerButton = await screen.findByRole('button', {
    name: 'Printer',
  });

  mockApiClient.connectPrinter.expectCallWith().resolves();
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: true,
    config: mockPrinterConfig,
  });
  await userEvent.click(printerButton);
  await waitFor(() => mockApiClient.assertComplete());

  mockApiClient.disconnectPrinter.expectCallWith().resolves();
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: false,
  });
  await userEvent.click(printerButton);
  await waitFor(() => mockApiClient.assertComplete());

  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );
});

test('printer mock when disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );

  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec
    .expectCallWith()
    .resolves({ printerConfig: mockPrinterConfig });
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: false,
  });

  renderDock(mockApiClient);
  const printerButton = await screen.findByRole('button', {
    name: 'Printer',
  });

  expect(printerButton).toBeDisabled();
  screen.getByText('Printer mock disabled');
  await userEvent.click(printerButton);
});

test('hardware mock controls: toggle barcode, PAT input, and accessible controller', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_XKEYS
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_ACCESSIBLE_CONTROLLER
  );

  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec.expectCallWith().resolves({
    hasBarcodeMock: true,
    hasPatInputMock: true,
    hasAccessibleControllerMock: true,
  });

  // Initial hardware status: all disconnected, then updated as we toggle
  mockApiClient.getHardwareMockStatus.expectRepeatedCallsWith().resolves({
    barcodeConnected: false,
    patInputConnected: false,
    accessibleControllerConnected: false,
  });

  renderDock(mockApiClient);

  const barcodeButton = await screen.findByRole('button', {
    name: 'Barcode Reader',
  });
  const patButton = screen.getByRole('button', { name: 'PAT Input' });
  const accessibleButton = screen.getByRole('button', {
    name: 'Accessible Controller',
  });

  // Toggle barcode
  mockApiClient.setBarcodeConnected
    .expectCallWith({ connected: true })
    .resolves();
  mockApiClient.getHardwareMockStatus.expectRepeatedCallsWith().resolves({
    barcodeConnected: true,
    patInputConnected: false,
    accessibleControllerConnected: false,
  });
  await userEvent.click(barcodeButton);
  await waitFor(() => mockApiClient.assertComplete());

  // Toggle PAT input
  mockApiClient.setPatInputConnected
    .expectCallWith({ connected: true })
    .resolves();
  mockApiClient.getHardwareMockStatus.expectRepeatedCallsWith().resolves({
    barcodeConnected: true,
    patInputConnected: true,
    accessibleControllerConnected: false,
  });
  await userEvent.click(patButton);
  await waitFor(() => mockApiClient.assertComplete());

  // Toggle Accessible Controller
  mockApiClient.setAccessibleControllerConnected
    .expectCallWith({ connected: true })
    .resolves();
  mockApiClient.getHardwareMockStatus.expectRepeatedCallsWith().resolves({
    barcodeConnected: true,
    patInputConnected: true,
    accessibleControllerConnected: true,
  });
  await userEvent.click(accessibleButton);
  await waitFor(() => mockApiClient.assertComplete());
});

test('barcode scan mock control', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
  );
  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec
    .expectCallWith()
    .resolves({ hasBarcodeScanMock: true });

  renderDock(mockApiClient);
  const scanButton = await screen.findByRole('button', {
    name: 'Barcode Scan',
  });

  await userEvent.click(scanButton);
  await screen.findByRole('alertdialog');
  expect(screen.getByRole('textbox', { name: 'Barcode Contents' })).toHaveValue(
    '{"bId":""}'
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  await userEvent.click(scanButton);
  await screen.findByRole('alertdialog');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  await userEvent.click(scanButton);
  await screen.findByRole('alertdialog');
  const input = screen.getByRole('textbox', { name: 'Barcode Contents' });
  await userEvent.clear(input);
  await userEvent.type(input, 'test-barcode');
  const emitBarcodeScanDeferred = deferred<void>();
  mockApiClient.emitBarcodeScan
    .expectCallWith({ payload: 'test-barcode' })
    .returns(emitBarcodeScanDeferred.promise);
  await userEvent.click(screen.getByRole('button', { name: 'Scan' }));
  await waitFor(() => mockApiClient.assertComplete());
  screen.getByRole('alertdialog');

  emitBarcodeScanDeferred.resolve();
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  await waitFor(() => mockApiClient.assertComplete());
});

test('barcode scan mock control disabled when feature flag disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
  );
  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec
    .expectCallWith()
    .resolves({ hasBarcodeScanMock: true });

  renderDock(mockApiClient);

  expect(
    await screen.findByRole('button', { name: 'Barcode Scan' })
  ).toBeDisabled();
  screen.getByText('Hardware mock disabled');
});

test('hardware mock controls disabled when feature flags disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
  );
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_XKEYS
  );
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_ACCESSIBLE_CONTROLLER
  );

  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec.expectCallWith().resolves({
    hasBarcodeMock: true,
    hasPatInputMock: true,
    hasAccessibleControllerMock: true,
  });
  mockApiClient.getHardwareMockStatus.expectRepeatedCallsWith().resolves({
    barcodeConnected: false,
    patInputConnected: false,
    accessibleControllerConnected: false,
  });

  renderDock(mockApiClient);

  const barcodeButton = await screen.findByRole('button', {
    name: 'Barcode Reader',
  });
  const patButton = screen.getByRole('button', { name: 'PAT Input' });
  const accessibleButton = screen.getByRole('button', {
    name: 'Accessible Controller',
  });

  expect(barcodeButton).toBeDisabled();
  expect(patButton).toBeDisabled();
  expect(accessibleButton).toBeDisabled();
  // At least one disabled overlay should be visible
  await screen.findAllByText('Hardware mock disabled');
});

describe('fujitsu printer mock', () => {
  test('when disabled', async () => {
    featureFlagMock.disableFeatureFlag(
      BooleanEnvironmentVariableName.USE_MOCK_PRINTER
    );

    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ printerConfig: 'fujitsu' });
    mockApiClient.getFujitsuPrinterStatus.expectCallWith().resolves({
      state: 'idle',
    });

    renderDock(mockApiClient);
    const dropdown = await screen.findByLabelText('Printer:');

    expect(dropdown).toBeDisabled();
    within(dropdown).getByText('Disabled');
  });

  test('updating mock printer status', async () => {
    featureFlagMock.enableFeatureFlag(
      BooleanEnvironmentVariableName.USE_MOCK_PRINTER
    );

    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ printerConfig: 'fujitsu' });
    mockApiClient.getFujitsuPrinterStatus.expectCallWith().resolves({
      state: 'idle',
    });

    renderDock(mockApiClient);
    const dropdown = await screen.findByLabelText('Printer:');
    await waitFor(() => {
      expect(dropdown).toHaveValue('idle');
    });

    mockApiClient.setFujitsuPrinterStatus
      .expectCallWith({ state: 'no-paper' })
      .resolves();
    mockApiClient.getFujitsuPrinterStatus.expectCallWith().resolves({
      state: 'no-paper',
    });
    await userEvent.selectOptions(dropdown, screen.getByText('no-paper'));
    await waitFor(() => {
      expect(dropdown).toHaveValue('no-paper');
    });
  });
});

const IDLE_PDI_STATUS = {
  sheetStatus: 'noSheetEnabled',
  queue: undefined,
} as const;

function setupPdiScannerMocks() {
  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec.expectCallWith().resolves({ mockPdiScanner: true });
  mockApiClient.pdiScannerGetStatus
    .expectRepeatedCallsWith()
    .resolves(IDLE_PDI_STATUS);
}

describe('PDI scanner mock', () => {
  test('when disabled, not shown', async () => {
    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ printerConfig: 'fujitsu', mockPdiScanner: false });
    mockApiClient.getFujitsuPrinterStatus.expectCallWith().resolves({
      state: 'idle',
    });

    renderDock(mockApiClient);
    await screen.findByText(/Printer:/);
    expect(screen.queryByLabelText('Scanner:')).not.toBeInTheDocument();
  });

  test('has button to insert and remove ballot', async () => {
    setupPdiScannerMocks();

    renderDock(mockApiClient);
    const insertBallotButton = await screen.findByRole('button', {
      name: 'Insert Ballot',
    });
    expect(insertBallotButton).toBeEnabled();

    kiosk.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['mock-ballot-path.pdf'],
    });
    mockApiClient.pdiScannerInsertSheets
      .expectCallWith({ path: 'mock-ballot-path.pdf' })
      .resolves();
    mockApiClient.pdiScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves(IDLE_PDI_STATUS);
    await userEvent.click(insertBallotButton);

    mockApiClient.pdiScannerGetStatus.expectRepeatedCallsWith().resolves({
      sheetStatus: 'sheetInserted',
      queue: { total: 1, inserted: 1 },
    });
    await waitFor(
      () => expect(insertBallotButton).toBeDisabled(),
      { timeout: 2000 } // status query refetches every 500ms
    );

    // Single-sheet queue should not enable the Clear button
    const scannerSection = assertDefined(insertBallotButton.closest('div'));
    const clearButton = within(scannerSection).getByRole('button', {
      name: 'Clear',
    });
    expect(clearButton).toBeDisabled();

    mockApiClient.pdiScannerGetStatus.expectRepeatedCallsWith().resolves({
      sheetStatus: 'sheetHeldInFront',
      queue: { total: 1, inserted: 1 },
    });
    const removeBallotButton = await screen.findByRole(
      'button',
      { name: 'Remove Ballot' },
      { timeout: 2000 }
    );

    mockApiClient.pdiScannerRemoveSheet.expectCallWith().resolves();
    await userEvent.click(removeBallotButton);

    mockApiClient.pdiScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves(IDLE_PDI_STATUS);
    await screen.findByRole(
      'button',
      { name: 'Insert Ballot' },
      { timeout: 2000 }
    );
  });

  test('shows queue progress for multi-sheet PDFs', async () => {
    setupPdiScannerMocks();

    renderDock(mockApiClient);
    const insertBallotButton = await screen.findByRole('button', {
      name: 'Insert Ballot',
    });

    kiosk.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['multi-page.pdf'],
    });
    mockApiClient.pdiScannerInsertSheets
      .expectCallWith({ path: 'multi-page.pdf' })
      .resolves();
    mockApiClient.pdiScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves(IDLE_PDI_STATUS);
    await userEvent.click(insertBallotButton);

    // After insert, queue becomes active with multi-sheet progress
    mockApiClient.pdiScannerGetStatus.expectRepeatedCallsWith().resolves({
      sheetStatus: 'sheetInserted',
      queue: { total: 5, inserted: 1 },
    });

    // Should show progress text and enabled clear button
    const progressText = await screen.findByText(/1\/5/, undefined, {
      timeout: 2000,
    });
    const scannerSection = assertDefined(progressText.closest('div'));
    const clearButton = within(scannerSection).getByRole('button', {
      name: 'Clear',
    });
    expect(clearButton).toBeEnabled();

    // Clear the queue — after clear, queue is inactive and scanner is idle
    mockApiClient.pdiScannerClearSheetQueue.expectCallWith().resolves();
    mockApiClient.pdiScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves(IDLE_PDI_STATUS);
    await userEvent.click(clearButton);

    // Should go back to showing Insert Ballot; wait for all mocks to be
    // consumed by the refetch interval
    await waitFor(() => mockApiClient.assertComplete(), { timeout: 3000 });
  });

  test('ignores canceled open file dialog', async () => {
    setupPdiScannerMocks();

    renderDock(mockApiClient);
    const insertBallotButton = await screen.findByRole('button', {
      name: 'Insert Ballot',
    });

    kiosk.showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    await userEvent.click(insertBallotButton);
    await waitFor(() => {
      expect(kiosk.showOpenDialog).toHaveBeenCalled();
      mockApiClient.assertComplete();
    });
  });
});

describe('batch scanner mock', () => {
  test('when disabled, not shown', async () => {
    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ mockBatchScanner: false });

    renderDock(mockApiClient);
    await screen.findByRole('combobox'); // wait for dock to render
    expect(screen.queryByText('Batch Scanner:')).not.toBeInTheDocument();
  });

  test('load ballots and clear', async () => {
    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ mockBatchScanner: true });
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 0, errorQueued: false });

    renderDock(mockApiClient);
    const loadButton = await screen.findByRole('button', {
      name: 'Load Ballots',
    });
    expect(loadButton).toBeEnabled();

    // Simulate selecting files
    kiosk.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/ballot1.pdf', '/ballot2.pdf'],
    });
    mockApiClient.batchScannerLoadBallots
      .expectCallWith({ paths: ['/ballot1.pdf', '/ballot2.pdf'] })
      .resolves();
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 2, errorQueued: false });
    await userEvent.click(loadButton);

    const queuedText = await screen.findByText(/2 sheet\(s\) queued/);
    // Get the Clear button within the batch scanner section (not the USB Clear)
    const clearButton = within(
      assertDefined(queuedText.closest('div'))
    ).getByRole('button', { name: 'Clear' });

    // Clear the ballots
    mockApiClient.batchScannerClearBallots.expectCallWith().resolves();
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 0, errorQueued: false });
    await userEvent.click(clearButton);
    await waitFor(() => {
      expect(screen.queryByText(/sheet\(s\) queued/)).not.toBeInTheDocument();
    });
    expect(clearButton).toBeDisabled();
  });

  test('ignores canceled open file dialog', async () => {
    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ mockBatchScanner: true });
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 0, errorQueued: false });

    renderDock(mockApiClient);
    const loadButton = await screen.findByRole('button', {
      name: 'Load Ballots',
    });

    kiosk.showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    });
    await userEvent.click(loadButton);
    await waitFor(() => {
      expect(kiosk.showOpenDialog).toHaveBeenCalled();
      mockApiClient.assertComplete();
    });
  });

  test('changing copies updates the queued sheet count', async () => {
    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ mockBatchScanner: true });
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 2, errorQueued: false });

    renderDock(mockApiClient);
    await screen.findByText(/2 sheet\(s\) queued/);
    const copiesInput = screen.getByRole('spinbutton', { name: 'Copies' });

    mockApiClient.batchScannerSetCopies
      .expectCallWith({ copies: 3 })
      .resolves();
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 6, errorQueued: false });
    fireEvent.change(copiesInput, { target: { value: '3' } });

    await screen.findByText(/6 sheet\(s\) queued/);

    // Blanking the input falls back to a single copy
    mockApiClient.batchScannerSetCopies
      .expectCallWith({ copies: 1 })
      .resolves();
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 2, errorQueued: false });
    fireEvent.change(copiesInput, { target: { value: '' } });

    await screen.findByText(/2 sheet\(s\) queued/);
  });

  test('queue and cancel a simulated scanner error', async () => {
    mockApiClient.getMockSpec.reset();
    mockApiClient.getMockSpec
      .expectCallWith()
      .resolves({ mockBatchScanner: true });
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 0, errorQueued: false });

    renderDock(mockApiClient);
    const errorButton = await screen.findByRole('button', {
      name: 'Queue Error',
    });
    expect(errorButton).toBeEnabled();

    mockApiClient.batchScannerSetErrorQueued
      .expectCallWith({ errorQueued: true })
      .resolves();
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 0, errorQueued: true });
    await userEvent.click(errorButton);

    const cancelButton = await screen.findByRole('button', {
      name: 'Cancel Error',
    });
    expect(cancelButton).toBeEnabled();

    mockApiClient.batchScannerSetErrorQueued
      .expectCallWith({ errorQueued: false })
      .resolves();
    mockApiClient.batchScannerGetStatus
      .expectRepeatedCallsWith()
      .resolves({ sheetCount: 0, errorQueued: false });
    await userEvent.click(cancelButton);

    await screen.findByRole('button', { name: 'Queue Error' });
  });
});

function renderDock(api: MockClient<Api>) {
  return render(<DevDock apiClient={api} enableAccessibleNav />);
}

function enableQuickConfigurePreconditions() {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_PIN_ENTRY
  );
  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec.expectCallWith().resolves({
    hasQuickConfigure: true,
  });
}

function expectSelectedElectionPackage() {
  mockApiClient.getElection.reset();
  mockApiClient.getElection.expectCallWith().resolves({
    title: 'Famous Names',
    inputPath: '/hub/exports/election-package-abc-123.zip',
    resolvedPath: '/full-path',
    arePollWorkerCardPinsEnabled: false,
    isElectionPackage: true,
  });
}

test('quick configure button', async () => {
  enableQuickConfigurePreconditions();
  expectSelectedElectionPackage();

  renderDock(mockApiClient);
  const quickConfigureButton = await screen.findByRole('button', {
    name: 'Quick Configure',
  });
  await waitFor(() => expect(quickConfigureButton).toBeEnabled());

  mockApiClient.quickConfigure
    .expectCallWith()
    .throws(new Error('Election package exceeds system limits'));
  await userEvent.click(quickConfigureButton);
  await screen.findByText('Election package exceeds system limits');

  const reload = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });
  mockApiClient.quickConfigure.expectCallWith().resolves();
  await userEvent.click(quickConfigureButton);
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});

test('quick configure button is disabled without an election package', async () => {
  enableQuickConfigurePreconditions();
  // The default mocked election is a bare election definition.

  renderDock(mockApiClient);
  const quickConfigureButton = await screen.findByRole('button', {
    name: 'Quick Configure',
  });
  expect(quickConfigureButton).toBeDisabled();
  await screen.findByText('Select an election package');
});

test('quick configure button is hidden unless its preconditions are met', async () => {
  renderDock(mockApiClient);
  await screen.findByRole('button', { name: 'Election Manager' });
  expect(screen.queryByRole('button', { name: 'Quick Configure' })).toBeNull();
});

test('quick configure button is hidden in apps that do not support it', async () => {
  enableQuickConfigurePreconditions();
  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec.expectCallWith().resolves({});
  expectSelectedElectionPackage();

  renderDock(mockApiClient);
  await screen.findByRole('button', { name: 'Election Manager' });
  expect(screen.queryByRole('button', { name: 'Quick Configure' })).toBeNull();
});

test('dock position menu moves the dock to a chosen side', async () => {
  renderDock(mockApiClient);
  const positionButton = await screen.findByRole('button', {
    name: 'Dock Position',
  });

  // Open the menu and move the dock to the bottom
  await userEvent.click(positionButton);
  expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  mockApiClient.setDockSide.expectCallWith({ side: 'bottom' }).resolves();
  mockApiClient.getDockSide.expectCallWith().resolves('bottom');
  await userEvent.click(screen.getByRole('button', { name: 'Bottom' }));

  // The menu closes on selection
  expect(
    screen.queryByRole('button', { name: 'Bottom' })
  ).not.toBeInTheDocument();

  // Reopening shows the new side as active
  await userEvent.click(positionButton);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Bottom' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  // Selecting the current side just closes the menu without a backend call
  await userEvent.click(screen.getByRole('button', { name: 'Bottom' }));
  expect(
    screen.queryByRole('button', { name: 'Bottom' })
  ).not.toBeInTheDocument();

  // The menu can be toggled closed with the gear button
  await userEvent.click(positionButton);
  screen.getByRole('button', { name: 'Top' });
  await userEvent.click(positionButton);
  expect(screen.queryByRole('button', { name: 'Top' })).not.toBeInTheDocument();
});

test('dock side is loaded from the backend', async () => {
  mockApiClient.getDockSide.reset();
  mockApiClient.getDockSide.expectCallWith().resolves('left');
  renderDock(mockApiClient);

  const positionButton = await screen.findByRole('button', {
    name: 'Dock Position',
  });
  await userEvent.click(positionButton);
  expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});

function dockContainer(): HTMLElement {
  return assertDefined(
    screen
      .getByLabelText(/^(Start|Stop) Screen Recording$/)
      .closest<HTMLElement>('[dir="ltr"]')
  );
}

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];

  static supportedMimeTypes = ['video/mp4;codecs=avc1', 'video/webm'];

  static isTypeSupported(mimeType: string): boolean {
    return FakeMediaRecorder.supportedMimeTypes.includes(mimeType);
  }

  private readonly options: MediaRecorderOptions;

  private timeslice?: number;

  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    super();
    this.options = options;
    FakeMediaRecorder.instances.push(this);
  }

  get mimeType(): string | undefined {
    return this.options.mimeType;
  }

  get startedTimeslice(): number | undefined {
    return this.timeslice;
  }

  start(timeslice: number): void {
    this.timeslice = timeslice;
  }

  emitData(...bytes: number[]): void {
    const event = new Event('dataavailable');
    Object.assign(event, {
      data: {
        arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer),
      },
    });
    this.dispatchEvent(event);
  }

  stop(): void {
    this.emitData(9);
    this.dispatchEvent(new Event('stop'));
  }
}

interface FakeTrack extends EventTarget {
  stop: () => void;
}

function mockDisplayMedia(): { track: FakeTrack } {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  const stream: Record<'getTracks' | 'getVideoTracks', () => FakeTrack[]> = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(
    stream as unknown as MediaStream
  );
  return { track };
}

async function startRecording(): Promise<FakeMediaRecorder> {
  mockApiClient.beginScreenRecording.expectCallWith().resolves();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Start Screen Recording' })
  );
  await screen.findByLabelText('Stop Screen Recording');
  return assertDefined(FakeMediaRecorder.instances.at(-1));
}

describe('screen recording', () => {
  beforeEach(() => {
    document.title = 'VotingWorks VxScan';
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.supportedMimeTypes = [
      'video/mp4;codecs=avc1',
      'video/webm',
    ];
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('streams chunks to the backend and stops with Ctrl+C', async () => {
    const { track } = mockDisplayMedia();
    renderDock(mockApiClient);
    await screen.findByRole('button', { name: 'Toggle Dock' });

    const recorder = await startRecording();
    expect(recorder.mimeType).toEqual('video/mp4;codecs=avc1');
    expect(recorder.startedTimeslice).toEqual(1000);
    expect(dockContainer()).toHaveClass('closed');
    expect(dockContainer()).toHaveClass('hidden');
    expect(
      screen.queryByRole('button', { name: 'Toggle Dock' })
    ).not.toBeInTheDocument();

    await userEvent.keyboard('{Meta>}d{/Meta}');
    expect(dockContainer()).not.toHaveClass('hidden');
    await userEvent.keyboard('{Meta>}d{/Meta}');
    expect(dockContainer()).toHaveClass('hidden');

    mockApiClient.appendScreenRecording
      .expectCallWith({ data: Uint8Array.of(1, 2) })
      .resolves();
    mockApiClient.appendScreenRecording
      .expectCallWith({ data: Uint8Array.of(9) })
      .resolves();
    recorder.emitData(1, 2);
    await userEvent.keyboard('{Meta>}j{/Meta}');
    await userEvent.keyboard('{Control>}x{/Control}');
    await userEvent.keyboard('{Control>}c{/Control}');

    await screen.findByText('Save Screen Recording');
    expect(track.stop).toHaveBeenCalled();
    expect(dockContainer()).toHaveClass('closed');
    const fileNameInput = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Screen Recording File Name',
    });
    expect(fileNameInput.value).toMatch(/^Recording-VxScan-.*\.mp4$/);

    await userEvent.clear(fileNameInput);
    await userEvent.type(fileNameInput, 'demo.mp4');
    mockApiClient.saveScreenRecording
      .expectCallWith({ fileName: 'demo.mp4' })
      .resolves();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    await screen.findByRole('button', { name: 'Toggle Dock' });
  });

  test('Super+. stops a webm recording, which can be discarded', async () => {
    FakeMediaRecorder.supportedMimeTypes = ['video/webm'];
    mockDisplayMedia();
    renderDock(mockApiClient);
    const recorder = await startRecording();
    expect(recorder.mimeType).toEqual('video/webm');

    mockApiClient.appendScreenRecording
      .expectCallWith({ data: Uint8Array.of(9) })
      .resolves();
    await userEvent.keyboard('{Meta>}.{/Meta}');
    await screen.findByText('Save Screen Recording');
    expect(
      screen.getByRole<HTMLInputElement>('textbox', {
        name: 'Screen Recording File Name',
      }).value
    ).toMatch(/\.webm$/);

    mockApiClient.discardScreenRecording.expectCallWith().resolves();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  test('stop button and ending the capture both stop the recording', async () => {
    const { track } = mockDisplayMedia();
    renderDock(mockApiClient);
    await startRecording();

    await userEvent.keyboard('{Meta>}d{/Meta}');
    mockApiClient.appendScreenRecording
      .expectCallWith({ data: Uint8Array.of(9) })
      .resolves();
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop Screen Recording' })
    );
    track.dispatchEvent(new Event('ended'));
    await screen.findByText('Save Screen Recording');

    mockApiClient.discardScreenRecording.expectCallWith().resolves();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    const { track: secondTrack } = mockDisplayMedia();
    await startRecording();
    mockApiClient.appendScreenRecording
      .expectCallWith({ data: Uint8Array.of(9) })
      .resolves();
    secondTrack.dispatchEvent(new Event('ended'));
    await screen.findByText('Save Screen Recording');
  });

  test('reports a failed upload and discards the recording', async () => {
    mockDisplayMedia();
    renderDock(mockApiClient);
    await startRecording();

    mockApiClient.appendScreenRecording
      .expectCallWith({ data: Uint8Array.of(9) })
      .throws(new Error('disk full'));
    mockApiClient.discardScreenRecording.expectCallWith().resolves();
    await userEvent.keyboard('{Control>}c{/Control}');

    await screen.findByText('Saving the screen recording failed: disk full');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  test.each([
    [
      new DOMException('Not supported', 'NotSupportedError'),
      'This browser does not allow the page to record itself. Run a kiosk-browser that supports recording with --allow-devtools.',
    ],
    [
      new DOMException('Permission denied', 'NotAllowedError'),
      'Screen recording was cancelled.',
    ],
    [new Error('boom'), 'Screen recording failed: boom'],
  ])('reports capture failure %s', async (error, message) => {
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockRejectedValue(error);
    renderDock(mockApiClient);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Start Screen Recording' })
    );

    await screen.findByText('Screen Recording Failed');
    screen.getByText(message);
    expect(dockContainer()).toHaveClass('closed');
    expect(dockContainer()).not.toHaveClass('hidden');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});

test('handle toggles the dock open and closed', async () => {
  renderDock(mockApiClient);
  const handle = await screen.findByRole('button', { name: 'Toggle Dock' });
  const container = assertDefined(handle.parentElement);
  expect(container).not.toHaveClass('closed');

  await userEvent.click(handle);
  expect(container).toHaveClass('closed');

  await userEvent.click(handle);
  expect(container).not.toHaveClass('closed');
});

test('polls for newly exported elections', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });

  renderDock(mockApiClient);
  await screen.findByRole('option', { name: /electionGeneral/ });
  expect(
    screen.queryByRole('option', { name: 'VxHub: election-package-new.zip' })
  ).toBeNull();

  // A VxHub export made after the dock loaded should appear on its own.
  mockApiClient.getAvailableElections.reset();
  mockApiClient.getAvailableElections.expectRepeatedCallsWith().resolves([
    {
      title: 'VxHub: election-package-new.zip',
      inputPath: '/hub/exports/election-package-new.zip',
    },
    {
      title: 'electionGeneral',
      inputPath: './libs/fixtures/data/electionGeneral/election.json',
    },
  ]);

  await vi.advanceTimersByTimeAsync(5000);
  await screen.findByRole('option', {
    name: 'VxHub: election-package-new.zip',
  });

  vi.useRealTimers();
});

test('backup USB drive controls', async () => {
  mockApiClient.getMockSpec.reset();
  mockApiClient.getMockSpec
    .expectCallWith()
    .resolves({ mockBackupUsbDrive: true });
  const backupDiskPath = '/dev/sdc' as DevDockUsbDriveInfo['diskPath'];
  mockApiClient.getUsbDriveStatus.reset();
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'data' })
    .resolves({ diskPath: mockDiskPath, fstype: 'exfat', status: 'removed' });
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'backup' })
    .resolves({ diskPath: backupDiskPath, fstype: 'ext4', status: 'removed' });
  renderDock(mockApiClient);

  const backupDriveControl = await screen.findByRole('button', {
    name: 'USB Drive /dev/sdc',
  });
  await waitFor(() => expect(backupDriveControl).toBeEnabled());
  screen.getByRole('button', { name: 'USB Drive /dev/sdb' });
  screen.getByText('exfat');
  screen.getByText('ext4');

  mockApiClient.insertUsbDrive.expectCallWith({ purpose: 'backup' }).resolves();
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'backup' })
    .resolves({ diskPath: backupDiskPath, fstype: 'ext4', status: 'inserted' });
  await userEvent.click(backupDriveControl);
  await waitFor(() => mockApiClient.assertComplete());

  mockApiClient.removeUsbDrive.expectCallWith({ purpose: 'backup' }).resolves();
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'backup' })
    .resolves({ diskPath: backupDiskPath, fstype: 'ext4', status: 'removed' });
  await userEvent.click(backupDriveControl);
  await waitFor(() => mockApiClient.assertComplete());

  const [, clearBackupDriveButton] = screen.getAllByRole('button', {
    name: 'Clear',
  });
  mockApiClient.clearUsbDrive.expectCallWith({ purpose: 'backup' }).resolves();
  mockApiClient.getUsbDriveStatus
    .expectCallWith({ purpose: 'backup' })
    .resolves({ diskPath: backupDiskPath, fstype: 'ext4', status: 'removed' });
  await userEvent.click(assertDefined(clearBackupDriveButton));
  await waitFor(() => mockApiClient.assertComplete());
});
