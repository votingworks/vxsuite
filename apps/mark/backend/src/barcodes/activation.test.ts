import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:stream';
import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  mockLogger,
  LogSource,
  Logger,
  mockBaseLogger,
} from '@votingworks/logging';
import tmp from 'tmp';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  pollingPlaceBallotStyles,
  pollingPlacePrecinctIds,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName as Feature,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  mockCardlessVoterUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';

import { assertDefined, sleep } from '@votingworks/basics';
import {
  resolvePrecinctsForBallotStyle,
  setUpBarcodeActivation,
} from './activation';
import { createWorkspace, Workspace } from '../util/workspace';
import { getUserRole } from '../util/auth';
import { BarcodeReader } from './types';

const featureFlagMock = getFeatureFlagMock();
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (f: Feature) => featureFlagMock.isEnabled(f),
}));

// Mock the Client class to avoid actually starting worker threads
type MockBarcodeClient = EventEmitter<{
  error: [Error];
  scan: [Uint8Array];
}>;

function createMockBarcodeClient(): MockBarcodeClient {
  return new EventEmitter();
}

// Builds the bytes a scanner emits for a ballot style QR code.
function qrPayload(ballotStyleId: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ballotStyleId }));
}

function buildMockLogger(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): Logger {
  return mockLogger({
    source: LogSource.VxMarkBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

interface Context {
  auth: InsertedSmartCardAuthApi;
  barcodeClient?: BarcodeReader;
  logger: Logger;
  workspace: Workspace;
}

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
});

describe('setUpBarcodeActivation', () => {
  let workspace: Workspace;
  let mockAuth: InsertedSmartCardAuthApi;
  let logger: Logger;
  let mockBarcodeClient: MockBarcodeClient;

  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const [pollingPlace] = assertDefined(election.pollingPlaces);

  beforeEach(() => {
    workspace = createWorkspace(
      tmp.dirSync().name,
      mockBaseLogger({ fn: vi.fn })
    );
    mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
    logger = buildMockLogger(mockAuth, workspace);
    mockBarcodeClient = createMockBarcodeClient();
  });

  test('does nothing when barcodeClient is not provided', () => {
    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: undefined,
      logger,
      workspace,
    };

    // Should not throw and should not set up any listeners
    setUpBarcodeActivation(ctx);
  });

  test('sets up listeners when barcodeClient is provided', () => {
    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    // Should have registered listeners
    expect(mockBarcodeClient.listenerCount('error')).toEqual(1);
    expect(mockBarcodeClient.listenerCount('scan')).toEqual(1);
  });

  test('logs error events from barcode client', () => {
    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    const testError = new Error('test error');
    mockBarcodeClient.emit('error', testError);

    expect(logger.log).toHaveBeenCalledWith(
      expect.any(String),
      'system',
      expect.objectContaining({
        message: 'unexpected barcode reader error',
      })
    );
  });

  test('ignores empty barcode scans', async () => {
    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    // Emit an empty scan
    mockBarcodeClient.emit('scan', new TextEncoder().encode(''));

    // Wait for any async handlers
    await vi.waitFor(() => {
      // Should not have tried to start a session
      expect(mockAuth.startCardlessVoterSession).not.toHaveBeenCalled();
    });
  });

  test('ignores scans when QR ballot activation is disabled', async () => {
    // Configure election with the feature explicitly disabled.
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings({
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: false,
    });
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_open');

    vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    // Emit a valid scan
    mockBarcodeClient.emit('scan', new TextEncoder().encode('test-barcode'));

    // Wait for async handlers
    await vi.waitFor(() => {
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message:
            'barcode scan detected but QR ballot activation is disabled - ignoring',
        })
      );
    });

    expect(mockAuth.startCardlessVoterSession).not.toHaveBeenCalled();
  });

  test('ignores scans when polls are not open', async () => {
    // Configure election with feature enabled but polls closed
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_closed_initial');

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    mockBarcodeClient.emit('scan', new TextEncoder().encode('test-barcode'));

    await vi.waitFor(() => {
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'barcode scan detected in non-active polls state - ignoring',
        })
      );
    });

    expect(mockAuth.startCardlessVoterSession).not.toHaveBeenCalled();
  });

  test('ignores scans when a voter session is already active', async () => {
    // Configure election with feature enabled and polls open
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_open');

    // Mock that there's already a cardless voter session active
    vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: mockCardlessVoterUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    });

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    mockBarcodeClient.emit('scan', new TextEncoder().encode('test-barcode'));

    await vi.waitFor(() => {
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'barcode scan detected during voter session - ignoring',
        })
      );
    });

    expect(mockAuth.startCardlessVoterSession).not.toHaveBeenCalled();
  });

  test('starts voter session on valid barcode scan when feature is enabled', async () => {
    // Configure election with feature enabled and polls open
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_open');
    workspace.store.setBarcodeActivationMode('voter_session');

    // Mock no current auth session initially, then voter session after start
    let sessionStarted = false;
    vi.mocked(mockAuth.getAuthStatus).mockImplementation(() => {
      if (sessionStarted) {
        return Promise.resolve({
          status: 'logged_in' as const,
          user: mockCardlessVoterUser({
            ballotStyleId: election.ballotStyles[0].id,
            precinctId: election.ballotStyles[0].precincts[0],
          }),
          sessionExpiresAt: mockSessionExpiresAt(),
        });
      }
      return Promise.resolve({
        status: 'logged_out' as const,
        reason: 'no_card' as const,
      });
    });

    const mockStartSession = vi.mocked(mockAuth.startCardlessVoterSession);
    mockStartSession.mockImplementation(() => {
      sessionStarted = true;
      return Promise.resolve();
    });

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    const [scannedBallotStyle] = pollingPlaceBallotStyles(
      election,
      pollingPlace
    );
    mockBarcodeClient.emit('scan', qrPayload(scannedBallotStyle.id));

    await sleep(0);
    expect(mockAuth.startCardlessVoterSession).toHaveBeenCalled();

    const precinctIds = pollingPlacePrecinctIds(pollingPlace);

    const startSessionInput = mockStartSession.mock.calls[0][1];
    expect(startSessionInput.ballotStyleId).toEqual(scannedBallotStyle.id);
    expect(precinctIds).toContain(startSessionInput.precinctId);
    expect(startSessionInput.skipPollWorkerCheck).toEqual(true);

    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        message: 'voter session started successfully',
        disposition: 'success',
      })
    );
  });

  test('surfaces scan without starting a voter session in ballot_printing mode', async () => {
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_open');
    workspace.store.setBarcodeActivationMode('ballot_printing');

    vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    const [scannedBallotStyle] = pollingPlaceBallotStyles(
      election,
      pollingPlace
    );
    mockBarcodeClient.emit('scan', qrPayload(scannedBallotStyle.id));

    await vi.waitFor(() => {
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ballotStyleId: scannedBallotStyle.id,
          disposition: 'success',
          message: 'barcode scan detected - surfacing for ballot printing',
        })
      );
    });

    expect(mockAuth.startCardlessVoterSession).not.toHaveBeenCalled();
  });

  test('logs error when starting voter session fails', async () => {
    // Configure election with feature enabled and polls open
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_open');

    vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    vi.mocked(mockAuth.startCardlessVoterSession).mockRejectedValue(
      new Error('Failed to start session')
    );

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    const [scannedBallotStyle] = pollingPlaceBallotStyles(
      election,
      pollingPlace
    );
    mockBarcodeClient.emit('scan', qrPayload(scannedBallotStyle.id));

    await vi.waitFor(() => {
      expect(logger.log).toHaveBeenCalledWith(
        expect.any(String),
        'system',
        expect.objectContaining({
          message: 'failed to start voter session',
          disposition: 'failure',
        })
      );
    });
  });

  test('ignores scans that are not a valid ballot style QR code', async () => {
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_open');

    vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    mockBarcodeClient.emit('scan', new TextEncoder().encode('not-json'));

    await vi.waitFor(() => {
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining(
            'barcode scan could not be parsed as a ballot style QR code'
          ),
        })
      );
    });

    expect(mockAuth.startCardlessVoterSession).not.toHaveBeenCalled();
  });

  test('ignores scans for a ballot style not valid for the polling place', async () => {
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    workspace.store.setPollingPlaceId(pollingPlace.id);
    workspace.store.setPollsState('polls_open');

    vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    mockBarcodeClient.emit('scan', qrPayload('not-a-real-ballot-style'));

    await vi.waitFor(() => {
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message:
            'scanned ballot style is not valid for the configured polling place - ignoring',
        })
      );
    });

    expect(mockAuth.startCardlessVoterSession).not.toHaveBeenCalled();
  });
});

describe('resolvePrecinctsForBallotStyle', () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const [pollingPlace] = assertDefined(election.pollingPlaces);

  test('returns the polling place precincts a ballot style maps to', () => {
    const [ballotStyle] = pollingPlaceBallotStyles(election, pollingPlace);
    const placePrecinctIds = pollingPlacePrecinctIds(pollingPlace);
    const expected = ballotStyle.precincts.filter((p) =>
      placePrecinctIds.has(p)
    );

    expect(expected.length).toBeGreaterThan(0);
    expect(
      resolvePrecinctsForBallotStyle({
        election,
        pollingPlaceId: pollingPlace.id,
        ballotStyleId: ballotStyle.id,
      })
    ).toEqual(expected);
  });

  test('returns [] for an unknown ballot style', () => {
    expect(
      resolvePrecinctsForBallotStyle({
        election,
        pollingPlaceId: pollingPlace.id,
        ballotStyleId: 'not-a-real-ballot-style',
      })
    ).toEqual([]);
  });
});
