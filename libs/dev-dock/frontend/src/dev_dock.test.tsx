import { render, screen, waitFor } from '@testing-library/react';
import { Buffer } from 'buffer';
import userEvent from '@testing-library/user-event';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type { Api } from '@votingworks/dev-dock-backend';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  fakeSystemAdministratorUser,
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeKiosk,
  fakeFileWriter,
} from '@votingworks/test-utils';
import { CardStatus } from '@votingworks/auth';
import { DevDock } from './dev_dock';

const noCardStatus: CardStatus = {
  status: 'no_card',
};
const systemAdminCardStatus: CardStatus = {
  status: 'ready',
  cardDetails: {
    user: fakeSystemAdministratorUser(),
  },
};
const electionManagerCardStatus: CardStatus = {
  status: 'ready',
  cardDetails: {
    user: fakeElectionManagerUser(),
  },
};
const pollWorkerCardStatus: CardStatus = {
  status: 'ready',
  cardDetails: {
    user: fakePollWorkerUser(),
    hasPin: false,
  },
};

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

let mockApiClient: MockClient<Api>;
let mockKiosk!: jest.Mocked<KioskBrowser.Kiosk>;

beforeEach(() => {
  mockApiClient = createMockClient<Api>();
  mockApiClient.getMachineType.expectCallWith().resolves('central-scan');
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  mockApiClient.getUsbDriveStatus.expectCallWith().resolves('removed');
  mockApiClient.getElection.expectCallWith().resolves({
    title: 'Sample General Election',
    path: 'libs/fixtures/data/electionGeneral/election.json',
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
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
});

afterEach(() => {
  mockApiClient.assertComplete();
  featureFlagMock.resetFeatureFlags();
});

test('renders nothing if dev dock is disabled', () => {
  mockApiClient.getCardStatus.reset();
  mockApiClient.getElection.reset();
  mockApiClient.getUsbDriveStatus.reset();
  mockApiClient.getMachineType.reset();
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_DEV_DOCK
  );
  const { container } = render(<DevDock apiClient={mockApiClient} />);
  expect(container).toBeEmptyDOMElement();
});

test('card mock controls', async () => {
  render(<DevDock apiClient={mockApiClient} />);

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
  userEvent.click(systemAdminControl);
  await waitFor(() => {
    expect(electionManagerControl).toBeDisabled();
    expect(pollWorkerControl).toBeDisabled();
  });

  // Remove system admin card
  mockApiClient.removeCard.expectCallWith().resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  userEvent.click(systemAdminControl);
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
  userEvent.click(electionManagerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeDisabled();
    expect(pollWorkerControl).toBeDisabled();
  });

  // Remove election manager card
  mockApiClient.removeCard.expectCallWith().resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  userEvent.click(electionManagerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeEnabled();
    expect(pollWorkerControl).toBeEnabled();
  });

  // Insert poll worker card
  mockApiClient.insertCard.expectCallWith({ role: 'poll_worker' }).resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(pollWorkerCardStatus);
  userEvent.click(pollWorkerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeDisabled();
    expect(electionManagerControl).toBeDisabled();
  });

  // Remove poll worker card
  mockApiClient.removeCard.expectCallWith().resolves();
  mockApiClient.getCardStatus.expectCallWith().resolves(noCardStatus);
  userEvent.click(pollWorkerControl);
  await waitFor(() => {
    expect(systemAdminControl).toBeEnabled();
    expect(electionManagerControl).toBeEnabled();
  });
});

test('disabled card mock controls if card mocks are disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_CARDS
  );
  render(<DevDock apiClient={mockApiClient} />);

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
  render(<DevDock apiClient={mockApiClient} />);
  const electionSelector = await screen.findByRole('combobox');
  await waitFor(() => {
    expect(electionSelector).toHaveValue(
      'libs/fixtures/data/electionGeneral/election.json'
    );
  });

  mockApiClient.setElection
    .expectCallWith({
      path: 'libs/fixtures/data/electionFamousNames2021/election.json',
    })
    .resolves();
  mockApiClient.getElection.expectCallWith().resolves({
    title: 'Famous Names',
    path: 'libs/fixtures/data/electionFamousNames2021/election.json',
  });
  userEvent.selectOptions(
    electionSelector,
    screen.getByRole('option', { name: /Famous Names/ })
  );
  await waitFor(() => {
    expect(electionSelector).toHaveValue(
      'libs/fixtures/data/electionFamousNames2021/election.json'
    );
  });
});

test('USB drive controls', async () => {
  render(<DevDock apiClient={mockApiClient} />);
  const usbDriveControl = await screen.findByRole('button', {
    name: 'USB Drive',
  });
  await waitFor(() => expect(usbDriveControl).toBeEnabled());

  mockApiClient.insertUsbDrive.expectCallWith().resolves();
  mockApiClient.getUsbDriveStatus.expectCallWith().resolves('inserted');
  userEvent.click(usbDriveControl);
  // Not easy to test the color change of the button, so we'll just wait for the
  // API call to complete.
  await waitFor(() => mockApiClient.assertComplete());

  mockApiClient.removeUsbDrive.expectCallWith().resolves();
  mockApiClient.getUsbDriveStatus.expectCallWith().resolves('removed');
  userEvent.click(usbDriveControl);
  await waitFor(() => mockApiClient.assertComplete());

  const clearUsbDriveButton = screen.getByRole('button', {
    name: 'Clear',
  });
  mockApiClient.clearUsbDrive.expectCallWith().resolves();
  mockApiClient.getUsbDriveStatus.expectCallWith().resolves('removed');
  userEvent.click(clearUsbDriveButton);
  await waitFor(() => mockApiClient.assertComplete());
});

test('disabled USB drive controls if USB drive mocks are disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  render(<DevDock apiClient={mockApiClient} />);

  await screen.findByText('USB mock disabled');
  const usbDriveControl = screen.getByRole('button', {
    name: 'USB Drive',
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

test('screenshot button', async () => {
  render(<DevDock apiClient={mockApiClient} />);
  const screenshotButton = await screen.findByRole('button', {
    name: 'Capture Screenshot',
  });

  const screenshotBuffer = Buffer.of();
  const fileWriter = fakeFileWriter();
  mockKiosk.captureScreenshot.mockResolvedValueOnce(screenshotBuffer);
  mockKiosk.saveAs.mockResolvedValueOnce(fileWriter);
  userEvent.click(screenshotButton);

  await waitFor(() => {
    expect(mockKiosk.captureScreenshot).toHaveBeenCalled();
    expect(mockKiosk.saveAs).toHaveBeenCalled();
    expect(fileWriter.write).toHaveBeenCalledWith(screenshotBuffer);
  });
});

test('printer mock control', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );

  mockApiClient.getMachineType.reset();
  mockApiClient.getMachineType.expectCallWith().resolves('admin');
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: false,
  });

  render(<DevDock apiClient={mockApiClient} />);
  const printerButton = await screen.findByRole('button', {
    name: 'Printer',
  });

  mockApiClient.connectPrinter.expectCallWith().resolves();
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: true,
    config: {
      label: 'mock',
      vendorId: 0,
      productId: 0,
      baseDeviceUri: 'mock://',
      ppd: 'mock.ppd',
    },
  });
  userEvent.click(printerButton);
  await waitFor(() => mockApiClient.assertComplete());

  mockApiClient.disconnectPrinter.expectCallWith().resolves();
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: false,
  });
  userEvent.click(printerButton);
  await waitFor(() => mockApiClient.assertComplete());

  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );
});

test('printer mock when disabled', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );

  mockApiClient.getMachineType.reset();
  mockApiClient.getMachineType.expectCallWith().resolves('admin');
  mockApiClient.getPrinterStatus.expectCallWith().resolves({
    connected: false,
  });

  render(<DevDock apiClient={mockApiClient} />);
  const printerButton = await screen.findByRole('button', {
    name: 'Printer',
  });

  expect(printerButton).toBeDisabled();
  screen.getByText('Printer mock disabled');
  userEvent.click(printerButton);
});
