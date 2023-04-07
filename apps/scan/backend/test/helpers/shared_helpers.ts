import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { ok } from '@votingworks/basics';
import {
  MockUsb,
  createBallotPackageWithoutTemplates,
} from '@votingworks/backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  PrecinctId,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import waitForExpect from 'wait-for-expect';
import { Api } from '../../src/app';
import { PrecinctScannerInterpreter } from '../../src/interpret';
import {
  PrecinctScannerState,
  PrecinctScannerStatus,
  SheetInterpretation,
} from '../../src/types';

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
  }, 1_000);
}

const electionFamousNames2021WithoutTemplatesBallotPackageBuffer =
  createBallotPackageWithoutTemplates(
    electionFamousNames2021Fixtures.electionDefinition
  );

/**
 * configureApp is a testing convenience function that handles some common configuration of the VxScan app.
 * @param apiClient - a VxScan API client
 * @param mockUsb - a mock USB
 * @param options - an object containing optional arguments
 * @param options.mockAuth - a mock InsertedSmartCardAuthApi. Passing this will automatically
 *                           create a mock that auths the user as an election manager of the same
 *                           election defined in the ballot package.
 */
export async function configureApp(
  apiClient: grout.Client<Api>,
  mockUsb: MockUsb,
  {
    addTemplates = false,
    precinctId,
    mockAuth,
  }: {
    addTemplates?: boolean;
    precinctId?: PrecinctId;
    mockAuth?: InsertedSmartCardAuthApi;
  } = {
    addTemplates: false,
  }
): Promise<void> {
  if (mockAuth) {
    mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: fakeElectionManagerUser(
          electionFamousNames2021Fixtures.electionDefinition
        ),
        sessionExpiresAt: fakeSessionExpiresAt(),
      })
    );
  }

  const ballotPackageBuffer = addTemplates
    ? electionFamousNames2021Fixtures.ballotPackage.asBuffer()
    : electionFamousNames2021WithoutTemplatesBallotPackageBuffer;
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': ballotPackageBuffer,
    },
  });

  expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(ok());

  await apiClient.setPrecinctSelection({
    precinctSelection: precinctId
      ? singlePrecinctSelectionFor(precinctId)
      : ALL_PRECINCTS_SELECTION,
  });
  await apiClient.setTestMode({ isTestMode: false });
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
          originalFilename: 'fake_original_filename',
          normalizedFilename: 'fake_normalized_filename',
        },
        {
          interpretation: { type: 'BlankPage' },
          originalFilename: 'fake_original_filename',
          normalizedFilename: 'fake_normalized_filename',
        },
      ],
    })
  );
}
