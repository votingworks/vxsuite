import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { err, ok } from '@votingworks/basics';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  constructElectionKey,
  convertVxfElectionToCdfBallotDefinition,
  DEV_MACHINE_ID,
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { configureApp } from '../test/helpers/shared_helpers';
import { withApp } from '../test/helpers/pdi_helpers';
import { PrecinctScannerPollsInfo } from '.';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;

jest.setTimeout(30_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

function mockElectionManager(
  mockAuth: InsertedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(electionDefinition.election),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

function mockLoggedOut(mockAuth: InsertedSmartCardAuthApi) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
}

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getMachineConfig()).toEqual({
      machineId: 'test-machine-id',
      codeVersion: 'test-code-version',
    });
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getMachineConfig()).toEqual({
      machineId: DEV_MACHINE_ID,
      codeVersion: 'dev',
    });
  });
});

test("fails to configure if there's no election package on the usb drive", async () => {
  await withApp(async ({ apiClient, mockAuth, mockUsbDrive, logger }) => {
    mockElectionManager(mockAuth, electionGeneralDefinition);
    mockUsbDrive.insertUsbDrive({});
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('no_election_package_on_usb_drive')
    );

    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.ElectionConfigured,
      expect.objectContaining({
        disposition: 'failure',
      })
    );

    mockUsbDrive.insertUsbDrive({});
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('no_election_package_on_usb_drive')
    );
  });
});

test('fails to configure election package if logged out', async () => {
  await withApp(async ({ apiClient, mockAuth }) => {
    mockLoggedOut(mockAuth);
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('auth_required_before_election_package_load')
    );
  });
});

test('fails to configure election package if election definition on card does not match that of the election package', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth }) => {
    mockElectionManager(
      mockAuth,
      electionFamousNames2021Fixtures.readElectionDefinition()
    );
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition: electionGeneralDefinition,
      })
    );
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      err('election_key_mismatch')
    );
  });
});

test("if there's only one precinct in the election, it's selected automatically on configure", async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition();
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth, logger }) => {
    mockElectionManager(mockAuth, electionDefinition);
    mockUsbDrive.insertUsbDrive(
      await mockElectionPackageFileTree({
        electionDefinition,
      })
    );
    expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
      ok()
    );
    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.ElectionConfigured,
      expect.objectContaining({
        disposition: 'success',
      })
    );
    const config = await apiClient.getConfig();
    expect(config.precinctSelection).toMatchObject({
      kind: 'SinglePrecinct',
      precinctId: 'precinct-1',
    });
    expect(config.electionDefinition).toEqual(electionDefinition);
    expect(config.electionPackageHash).toEqual(expect.any(String));
  });
});

test('setPrecinctSelection will reset polls to closed', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth, logger }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive);

    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_open',
      lastPollsTransition: {
        type: 'open_polls',
        time: expect.anything(),
        ballotCount: 0,
      },
    });

    await apiClient.setPrecinctSelection({
      precinctSelection: singlePrecinctSelectionFor('21'),
    });
    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_closed_initial',
    });
    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.PrecinctConfigurationChanged,
      {
        disposition: 'success',
        message: 'User set the precinct for the machine to East Lincoln',
      }
    );
  });
});

test('setTestMode false will reset polls to closed', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth, logger }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive);

    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_open',
      lastPollsTransition: {
        type: 'open_polls',
        time: expect.anything(),
        ballotCount: 0,
      },
    });

    expect(logger.logAsCurrentRole).toHaveBeenCalledTimes(5);
    await apiClient.setTestMode({
      isTestMode: false,
    });
    expect(logger.logAsCurrentRole).toHaveBeenCalledTimes(7);
    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.ToggledTestMode,
      {
        disposition: 'success',
        message: expect.anything(),
        isTestMode: false,
      }
    );
    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_closed_initial',
    });
  });
});

test('setIsSoundMuted logs', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth, logger }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive);
    expect(await apiClient.getConfig()).toMatchObject(
      expect.objectContaining({
        isSoundMuted: false,
      })
    );

    await apiClient.setIsSoundMuted({
      isSoundMuted: true,
    });
    expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
      LogEventId.SoundToggled,
      {
        disposition: 'success',
        message: expect.anything(),
        isSoundMuted: true,
      }
    );
    expect(await apiClient.getConfig()).toMatchObject(
      expect.objectContaining({
        isSoundMuted: true,
      })
    );
  });
});

test('unconfiguring machine', async () => {
  await withApp(
    async ({ apiClient, mockUsbDrive, workspace, mockAuth, logger }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      jest.spyOn(workspace, 'reset');

      await apiClient.unconfigureElection();

      expect(workspace.reset).toHaveBeenCalledTimes(1);
      expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
        LogEventId.ElectionUnconfigured,
        expect.objectContaining({
          disposition: 'success',
        })
      );
    }
  );
});

test('configure with CDF election', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth }) => {
    const cdfElection =
      convertVxfElectionToCdfBallotDefinition(electionGeneral);
    const cdfElectionDefinition = safeParseElectionDefinition(
      JSON.stringify(cdfElection)
    ).unsafeUnwrap();
    await configureApp(apiClient, mockAuth, mockUsbDrive, {
      electionPackage: {
        electionDefinition: cdfElectionDefinition,
      },
    });

    const config = await apiClient.getConfig();
    expect(config.electionDefinition!.election.id).toEqual(electionGeneral.id);

    // Ensure loading auth election key from db works
    mockElectionManager(mockAuth, cdfElectionDefinition);
    expect(await apiClient.getAuthStatus()).toMatchObject({
      status: 'logged_in',
    });
  });
});
