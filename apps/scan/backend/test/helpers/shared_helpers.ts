import { Mocked, expect, vi } from 'vitest';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { iter, ok } from '@votingworks/basics';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  ElectionPackage,
  PrecinctId,
  PrecinctScannerState,
  SheetOf,
  asSheet,
  constructElectionKey,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import waitForExpect from 'wait-for-expect';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { mockLogger, LogSource, MockLogger } from '@votingworks/logging';
import { pdfToImages, ImageData } from '@votingworks/image-utils';

import { Api } from '../../src/app';
import {
  PrecinctScannerStateMachine,
  PrecinctScannerStatus,
} from '../../src/types';
import { Store } from '../../src/store';
import { getUserRole } from '../../src/util/auth';
import { Workspace } from '../../src/util/workspace';

export async function expectStatus(
  apiClient: grout.Client<Api>,
  expectedStatus: {
    state: PrecinctScannerState;
  } & Partial<PrecinctScannerStatus>
): Promise<void> {
  const status = await apiClient.getScannerStatus();
  expect(status).toEqual({
    ballotsCounted: 0,
    error: undefined,
    interpretation: undefined,
    ...expectedStatus,
  });
}

export async function waitForStatus(
  apiClient: grout.Client<Api>,
  status: {
    state: PrecinctScannerState;
  } & Partial<PrecinctScannerStatus>
): Promise<void> {
  await waitForExpect(async () => {
    await expectStatus(apiClient, status);
  }, 2_000);
}

/**
 * configureApp is a testing convenience function that handles some common configuration of the VxScan app.
 * @param apiClient - a VxScan API client
 * @param mockAuth - a mock InsertedSmartCardAuthApi
 * @param mockUsbDrive - a mock USB drive
 * @param options - an object containing optional arguments
 */
export async function configureApp(
  apiClient: grout.Client<Api>,
  mockAuth: InsertedSmartCardAuthApi,
  mockUsbDrive: MockUsbDrive,
  {
    electionPackage = electionFamousNames2021Fixtures.electionJson.toElectionPackage(),
    precinctId,
    testMode = false,
    openPolls = true,
  }: {
    electionPackage?: ElectionPackage;
    precinctId?: PrecinctId;
    testMode?: boolean;
    openPolls?: boolean;
  } = {}
): Promise<void> {
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(
          electionPackage.electionDefinition.election
        ),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );

  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(electionPackage)
  );

  expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
    ok()
  );

  await apiClient.setPrecinctSelection({
    precinctSelection: precinctId
      ? singlePrecinctSelectionFor(precinctId)
      : ALL_PRECINCTS_SELECTION,
  });
  await apiClient.setTestMode({ isTestMode: testMode });
  if (openPolls) {
    (await apiClient.openPolls()).unsafeUnwrap();
  }

  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}

/**
 * Continuous export to USB drive happens in the background as ballots are scanned. Ending a test
 * before continuous export finishes can result in errors due to directories getting cleaned up
 * while they're still being read from / written to.
 */
export async function waitForContinuousExportToUsbDrive(
  store: Store
): Promise<void> {
  await waitForExpect(
    () => expect(store.getPendingContinuousExportOperations()).toEqual([]),
    10000,
    250
  );
}

export function buildMockLogger(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxScanBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export function createPrecinctScannerStateMachineMock(): Mocked<PrecinctScannerStateMachine> {
  return {
    status: vi.fn(),
    accept: vi.fn(),
    return: vi.fn(),
    readyForNextBallot: vi.fn(),
    stop: vi.fn(),
    beginDoubleFeedCalibration: vi.fn(),
    endDoubleFeedCalibration: vi.fn(),
    beginImageSensorCalibration: vi.fn(),
    endImageSensorCalibration: vi.fn(),
    beginScannerDiagnostic: vi.fn(),
    endScannerDiagnostic: vi.fn(),
  };
}

export async function pdfToImageSheet(
  pdf: Uint8Array,
  { scale = 200 / 72 }: { scale?: number } = {}
): Promise<SheetOf<ImageData>> {
  return asSheet(
    await iter(pdfToImages(pdf, { scale }))
      .map(({ page }) => page)
      .toArray()
  );
}
