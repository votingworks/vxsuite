import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  mockOf,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { ballotPaperDimensions, BallotPaperSize } from '@votingworks/types';
import { iter } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { ballotImages, withApp } from '../../../test/helpers/pdi_helpers';
import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { delays } from './state_machine';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('scanner diagnostic, unconfigured - pass', async () => {
  await withApp(async ({ apiClient, mockScanner, mockAuth }) => {
    expect(await apiClient.getMostRecentScannerDiagnostic()).toBeNull();

    // Log in as system administrator
    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    });
    await expectStatus(apiClient, { state: 'paused' });
    expect(mockScanner.client.enableScanning).not.toHaveBeenCalled();

    // Start scanner diagnostic
    await apiClient.beginScannerDiagnostic();
    await waitForStatus(apiClient, { state: 'scanner_diagnostic.running' });
    expect(mockScanner.client.enableScanning).toHaveBeenCalledTimes(1);
    expect(mockScanner.client.enableScanning).toHaveBeenCalledWith({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: iter(Object.values(BallotPaperSize))
        .map((paperSize) => ballotPaperDimensions(paperSize).height)
        .max(),
    });

    // Simulate insert of blank sheet
    mockScanner.emitEvent({ event: 'scanStart' });
    await expectStatus(apiClient, { state: 'scanner_diagnostic.running' });
    mockScanner.emitEvent({
      event: 'scanComplete',
      images: await ballotImages.blankSheet(),
    });
    await waitForStatus(apiClient, { state: 'scanner_diagnostic.done' });
    expect(mockScanner.client.ejectDocument).toHaveBeenCalledTimes(1);
    expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toFront');

    // End scanner diagnostic
    await apiClient.endScannerDiagnostic();
    await waitForStatus(apiClient, { state: 'paused' });
    expect(await apiClient.getMostRecentScannerDiagnostic()).toEqual({
      type: 'blank-sheet-scan',
      outcome: 'pass',
      timestamp: expect.any(Number),
    });
  });
});

test('scanner diagnostic, configured - fail', async () => {
  const electionPackage =
    electionFamousNames2021Fixtures.electionJson.toElectionPackage();
  const { election } = electionPackage.electionDefinition;
  await withApp(async ({ apiClient, mockScanner, mockAuth, mockUsbDrive }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { electionPackage });
    expect(await apiClient.getMostRecentScannerDiagnostic()).toBeNull();

    // Log in as system administrator
    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    });
    await expectStatus(apiClient, { state: 'paused' });
    expect(mockScanner.client.enableScanning).not.toHaveBeenCalled();

    // Start scanner diagnostic
    await apiClient.beginScannerDiagnostic();
    await waitForStatus(apiClient, { state: 'scanner_diagnostic.running' });
    expect(mockScanner.client.enableScanning).toHaveBeenCalledTimes(1);
    expect(mockScanner.client.enableScanning).toHaveBeenCalledWith({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: ballotPaperDimensions(election.ballotLayout.paperSize)
        .height,
    });

    // Simulate insert of non-blank sheet
    mockScanner.emitEvent({ event: 'scanStart' });
    await expectStatus(apiClient, { state: 'scanner_diagnostic.running' });
    mockScanner.emitEvent({
      event: 'scanComplete',
      images: await ballotImages.completeHmpb(),
    });
    await waitForStatus(apiClient, {
      state: 'scanner_diagnostic.done',
      error: 'scanner_diagnostic_failed',
    });
    expect(mockScanner.client.ejectDocument).toHaveBeenCalledTimes(1);
    expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toFront');

    // End scanner diagnostic
    await apiClient.endScannerDiagnostic();
    await waitForStatus(apiClient, { state: 'paused' });
    expect(await apiClient.getMostRecentScannerDiagnostic()).toEqual({
      type: 'blank-sheet-scan',
      outcome: 'fail',
      timestamp: expect.any(Number),
    });
  });
});

test('removing card cancels diagnostic', async () => {
  await withApp(async ({ apiClient, mockAuth, mockUsbDrive, clock }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive);
    expect(await apiClient.getMostRecentScannerDiagnostic()).toBeNull();

    // Log in as system administrator
    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    });
    await waitForStatus(apiClient, { state: 'paused' });

    // Start scanner diagnostic
    await apiClient.beginScannerDiagnostic();
    await waitForStatus(apiClient, { state: 'scanner_diagnostic.running' });

    // Simulate card removal
    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL);
    await waitForStatus(apiClient, { state: 'no_paper' });

    expect(await apiClient.getMostRecentScannerDiagnostic()).toBeNull();
  });
});

test('scanner error fails diagnostic', async () => {
  await withApp(async ({ apiClient, mockScanner, mockAuth }) => {
    expect(await apiClient.getMostRecentScannerDiagnostic()).toBeNull();

    // Log in as system administrator
    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    });

    // Start scanner diagnostic
    await apiClient.beginScannerDiagnostic();
    await waitForStatus(apiClient, { state: 'scanner_diagnostic.running' });

    // Simulate scanner error
    mockScanner.emitEvent({ event: 'error', code: 'scanFailed' });
    await waitForStatus(apiClient, {
      state: 'scanner_diagnostic.done',
      error: 'client_error',
    });

    expect(await apiClient.getMostRecentScannerDiagnostic()).toEqual({
      type: 'blank-sheet-scan',
      outcome: 'fail',
      timestamp: expect.any(Number),
    });
  });
});

test('scanner unexpected event fails diagnostic', async () => {
  await withApp(async ({ apiClient, mockScanner, mockAuth }) => {
    expect(await apiClient.getMostRecentScannerDiagnostic()).toBeNull();

    // Log in as system administrator
    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    });

    // Start scanner diagnostic
    await apiClient.beginScannerDiagnostic();
    await waitForStatus(apiClient, { state: 'scanner_diagnostic.running' });

    // Simulate unexpected event
    mockScanner.emitEvent({ event: 'ejectPaused' });
    await waitForStatus(apiClient, {
      state: 'scanner_diagnostic.done',
      error: 'unexpected_event',
    });

    expect(await apiClient.getMostRecentScannerDiagnostic()).toEqual({
      type: 'blank-sheet-scan',
      outcome: 'fail',
      timestamp: expect.any(Number),
    });
  });
});
