import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { ok } from '@votingworks/basics';
import { createBallotPackageZipArchive } from '@votingworks/backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  BallotPackage,
  PrecinctId,
  SheetInterpretation,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import waitForExpect from 'wait-for-expect';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { PrecinctScannerInterpreter } from '../../src/interpret';
import { Api } from '../../src/app';
import { PrecinctScannerState, PrecinctScannerStatus } from '../../src/types';

export async function expectStatus(
  apiClient: grout.Client<Api>,
  expectedStatus: {
    state: PrecinctScannerState;
  } & Partial<PrecinctScannerStatus>
): Promise<void> {
  const status = await apiClient.getScannerStatus();
  expect(status).toEqual({
    ballotsCounted: 0,
    // TODO canUnconfigure should probably not be part of this endpoint - it's
    // only needed on the admin screen
    canUnconfigure: !expectedStatus?.ballotsCounted,
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
    ballotPackage = electionFamousNames2021Fixtures.electionJson.toBallotPackage(),
    precinctId,
    testMode = false,
  }: {
    ballotPackage?: BallotPackage;
    precinctId?: PrecinctId;
    testMode?: boolean;
  } = {}
): Promise<void> {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(ballotPackage.electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );

  mockUsbDrive.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': await createBallotPackageZipArchive(
        ballotPackage
      ),
    },
  });

  expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(ok());

  await apiClient.setPrecinctSelection({
    precinctSelection: precinctId
      ? singlePrecinctSelectionFor(precinctId)
      : ALL_PRECINCTS_SELECTION,
  });
  await apiClient.setTestMode({ isTestMode: testMode });
  await apiClient.setPollsState({ pollsState: 'polls_open' });
}

/**
 * Interpretation is generally the slowest part of tests in this file. To speed
 * up a test, you can use this function to mock interpretation. It should only
 * be used when:
 * - The test isn't meant to check that interpretation works correctly. There
 *   should already be another test that covers the same interpretation case.
 * - The test doesn't check the CVR export at the end. The interpreter stores
 *   the ballot images which are used in the CVR, and mocking will forgo that
 *   logic.
 * - The test doesn't depend on the actual page interpretations. This function
 *   adds fake page interpretations that don't actually match the passed in
 *   ballot interpretation (because the state machine doesn't actually use those
 *   page interpretations, they are just stored for the CVR).
 */
export function mockInterpretation(
  interpreter: PrecinctScannerInterpreter,
  interpretation: SheetInterpretation
): void {
  jest.spyOn(interpreter, 'interpret').mockResolvedValue(
    ok({
      ...interpretation,
      pages: [
        {
          interpretation: { type: 'BlankPage' },
          imagePath: 'fake_filename',
        },
        {
          interpretation: { type: 'BlankPage' },
          imagePath: 'fake_filename',
        },
      ],
    })
  );
}
