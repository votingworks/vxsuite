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
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  mockCardlessVoterUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';

import { setUpBarcodeActivation } from './activation';
import { createWorkspace, Workspace } from '../util/workspace';
import { getUserRole } from '../util/auth';
import { BarcodeReader } from './types';

// Mock the Client class to avoid actually starting worker threads
type MockBarcodeClient = EventEmitter<{
  error: [Error];
  scan: [Uint8Array];
}>;

function createMockBarcodeClient(): MockBarcodeClient {
  return new EventEmitter();
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

describe('setUpBarcodeActivation', () => {
  let workspace: Workspace;
  let mockAuth: InsertedSmartCardAuthApi;
  let logger: Logger;
  let mockBarcodeClient: MockBarcodeClient;

  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;

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
    // Configure election but leave system setting disabled
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
    workspace.store.setPollsState('polls_open');
    // System settings default has bmdEnableQrBallotActivation as undefined/false

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
    workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
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
    workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
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
    workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
    workspace.store.setPollsState('polls_open');

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

    vi.mocked(mockAuth.startCardlessVoterSession).mockImplementation(() => {
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

    mockBarcodeClient.emit('scan', new TextEncoder().encode('test-barcode'));

    await vi.waitFor(() => {
      expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ballotStyleId: election.ballotStyles[0].id,
          precinctId: election.ballotStyles[0].precincts[0],
          skipPollWorkerCheck: true,
        })
      );
    });

    expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        message: 'voter session started successfully',
        disposition: 'success',
      })
    );
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
    workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
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

    mockBarcodeClient.emit('scan', new TextEncoder().encode('test-barcode'));

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

  test('starts voter session with single precinct selection', async () => {
    // Configure election with feature enabled and polls open
    const systemSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      bmdEnableQrBallotActivation: true,
    };

    const precinctId = election.precincts[0].id;
    // Find the first ballot style that includes this precinct
    const matchingBallotStyle = election.ballotStyles.find((b) =>
      b.precincts.includes(precinctId)
    )!;

    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction: TEST_JURISDICTION,
      electionPackageHash: 'test-hash',
    });
    workspace.store.setSystemSettings(systemSettings);
    // Use single precinct selection to cover the else branch (lines 93-97)
    workspace.store.setPrecinctSelection(
      singlePrecinctSelectionFor(precinctId)
    );
    workspace.store.setPollsState('polls_open');

    vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    vi.mocked(mockAuth.startCardlessVoterSession).mockResolvedValue();

    const ctx: Context = {
      auth: mockAuth,
      barcodeClient: mockBarcodeClient as unknown as BarcodeReader,
      logger,
      workspace,
    };

    setUpBarcodeActivation(ctx);

    mockBarcodeClient.emit('scan', new TextEncoder().encode('test-barcode'));

    await vi.waitFor(() => {
      expect(mockAuth.startCardlessVoterSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ballotStyleId: matchingBallotStyle.id,
          // Should use the precinctId from single precinct selection, not from ballot style
          precinctId,
          skipPollWorkerCheck: true,
        })
      );
    });
  });
});
