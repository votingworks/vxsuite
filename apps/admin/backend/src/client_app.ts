import express, { Application } from 'express';
import {
  DippedSmartCardAuthApi,
  generateSignedHashValidationQrCodeValue,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import {
  assert,
  assertDefined,
  err,
  ok,
  Optional,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { createSystemCallApi } from '@votingworks/backend';
import { Logger, LogEventId } from '@votingworks/logging';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import {
  MultiUsbDrive,
  UsbDriveStatus,
  createUsbDriveAdapter,
} from '@votingworks/usb-drive';
import {
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  Id,
  Side,
  SystemSettings,
} from '@votingworks/types';
import { getMachineConfig } from './machine_config.js';
import { isMultiStationAdjudicationEnabled } from './multi_station_config.js';
import { MachineModeController } from './machine_mode.js';
import {
  type MachineMode,
  BallotPageImage,
  ClientConnectionStatus,
  ElectionRecord,
  AdjudicatedCvr,
  BallotAdjudicationData,
  BallotImages,
  AdjudicationError,
  WriteInCandidateRecord,
} from './types.js';
import { type HostConnection } from './client_store.js';
import type { PeerApi } from './peer_app.js';
import { type ClientWorkspace } from './util/workspace.js';
import { constructAuthMachineState } from './util/auth.js';

/**
 * Network connection status as returned to the frontend.
 */
export type NetworkConnectionStatus =
  | { status: 'offline' }
  | { status: 'online-waiting-for-host' }
  | { status: 'online-connected-to-host'; hostMachineId: string }
  | { status: 'online-multiple-hosts-detected' }
  | { status: 'online-incompatible-host-version' };

/**
 * Wraps a proxy call to the host, catching connection and network errors
 * and returning them as typed {@link AdjudicationError} results.
 */
async function proxyToHost<T>(
  clientStore: { getHostConnection(): HostConnection | undefined },
  logger: Logger,
  action: string,
  fn: (connection: HostConnection) => Promise<T>
): Promise<Result<T, AdjudicationError>> {
  const connection = clientStore.getHostConnection();
  if (!connection) {
    await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
      message: `Cannot ${action}: not connected to host.`,
    });
    return err({ type: 'host-disconnect' });
  }
  try {
    return ok(await fn(connection));
  } catch (error) {
    // @coverage-defer
    const message = error instanceof Error ? error.message : String(error);
    await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
      message: `Error during ${action}: ${message}`,
    });
    return err({ type: 'host-disconnect' });
  }
}

/**
 * Fetches a binary image from the host's peer server and returns it as a
 * base64 data URL.
 */
async function fetchImageAsDataUrl(
  hostAddress: string,
  cvrId: Id,
  side: Side
): Promise<string | undefined> {
  const url = `${hostAddress}/api/ballot-image/${cvrId}/${side}`;
  const response = await fetch(url);
  // @coverage-exclude: image fetch failure
  if (!response.ok) return undefined;
  // @coverage-exclude: content-type fallback
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const { Buffer: NodeBuffer } = await import('node:buffer');
  const buffer = NodeBuffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

/**
 * Fetches ballot image metadata from the host via grout, then fetches each
 * side's binary image and constructs {@link BallotImages} with embedded data
 * URLs. Binary images are fetched directly to avoid base64-in-JSON overhead.
 */
async function fetchBallotImagesFromHost(
  peerApi: grout.Client<PeerApi>,
  hostAddress: string,
  cvrId: Id
): Promise<BallotImages> {
  const metadata = await peerApi.getBallotImageMetadata({ cvrId });

  const [frontImageUrl, backImageUrl] = await Promise.all([
    fetchImageAsDataUrl(hostAddress, cvrId, 'front'),
    fetchImageAsDataUrl(hostAddress, cvrId, 'back'),
  ]);

  function withImageUrl(
    page: BallotPageImage,
    imageUrl?: string
  ): BallotPageImage {
    return { ...page, imageUrl };
  }

  return {
    cvrId: metadata.cvrId,
    front: withImageUrl(metadata.front, frontImageUrl),
    back: withImageUrl(metadata.back, backImageUrl),
  };
}

function buildClientApi({
  auth,
  workspace,
  machineMode,
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
  machineMode: MachineModeController;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}) {
  const { clientStore } = workspace;

  function proxy<T>(
    action: string,
    fn: (connection: HostConnection) => Promise<T>
  ): Promise<Result<T, AdjudicationError>> {
    return proxyToHost(clientStore, logger, action, fn);
  }

  const usbDriveAdapter = createUsbDriveAdapter(
    multiUsbDrive,
    // return the first FAT32 drive
    (drives) => drives.find((d) => d.partition?.fstype === 'fat32')?.diskPath
  );

  return grout.createApi({
    getMachineConfig,

    getMachineMode(): MachineMode {
      return machineMode.get();
    },

    isMultiStationAdjudicationEnabled(): boolean {
      return isMultiStationAdjudicationEnabled();
    },

    async setMachineMode(input: { mode: MachineMode }): Promise<void> {
      assert(
        clientStore.getCurrentElectionId() === undefined,
        'Cannot change machine mode while an election is configured.'
      );
      machineMode.set(input.mode);
      await logger.logAsCurrentRole(LogEventId.AdminMachineModeChanged, {
        message: `Machine mode changed to ${input.mode}.`,
        disposition: 'success',
        newMode: input.mode,
      });
    },

    getNetworkConnectionStatus(): NetworkConnectionStatus {
      const status = clientStore.getConnectionStatus();
      switch (status) {
        case ClientConnectionStatus.Offline:
          return { status: 'offline' };
        case ClientConnectionStatus.OnlineWaitingForHost:
          return { status: 'online-waiting-for-host' };
        case ClientConnectionStatus.OnlineConnectedToHost: {
          const hostConnection = assertDefined(clientStore.getHostConnection());
          return {
            status: 'online-connected-to-host',
            hostMachineId: hostConnection.machineId,
          };
        }
        case ClientConnectionStatus.OnlineMultipleHostsDetected:
          return { status: 'online-multiple-hosts-detected' };
        case ClientConnectionStatus.OnlineIncompatibleHostVersion:
          return { status: 'online-incompatible-host-version' };
        default:
          throwIllegalValue(status);
      }
    },

    getCurrentElectionMetadata(): ElectionRecord | null {
      return clientStore.getCachedElectionRecord() ?? null;
    },

    getAdjudicationSessionStatus(): {
      isClientAdjudicationEnabled: boolean;
    } {
      return {
        isClientAdjudicationEnabled:
          clientStore.getIsClientAdjudicationEnabled(),
      };
    },

    getSystemSettings(): SystemSettings {
      return clientStore.getCachedSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    // Adjudication proxy endpoints — forward to host peer API.
    // Return Result<T, AdjudicationError> so the frontend can handle
    // disconnect and claim errors without crashing to the error boundary.

    async releaseBallot(input: {
      cvrId: Id;
    }): Promise<Result<void, AdjudicationError>> {
      return proxy('release ballot', async ({ apiClient: peerApi }) => {
        await peerApi.releaseBallot({
          machineId: getMachineConfig().machineId,
          cvrId: input.cvrId,
        });
        await logger.logAsCurrentRole(LogEventId.AdminBallotReleased, {
          message: `Released ballot ${input.cvrId}.`,
        });
      });
    },

    async claimAndLoadBallot(input: {
      afterCvrId?: Id;
    }): Promise<
      Result<
        Optional<{ cvrId: Id; data: BallotAdjudicationData }>,
        AdjudicationError
      >
    > {
      const proxied = await proxy(
        'claim and load ballot',
        async ({ apiClient: peerApi }) =>
          peerApi.claimAndLoadBallot({
            machineId: getMachineConfig().machineId,
            afterCvrId: input.afterCvrId,
          })
      );
      if (proxied.isErr()) return proxied;
      const result = proxied.ok();
      if (result.isErr()) return result;
      const value = result.ok();
      if (value) {
        await logger.logAsCurrentRole(LogEventId.AdminBallotClaimed, {
          message: `Claimed ballot ${value.cvrId}.`,
          disposition: 'success',
        });
      }
      return ok(value);
    },

    async getBallotImages(input: {
      cvrId: Id;
    }): Promise<Result<BallotImages, AdjudicationError>> {
      return proxy(
        'fetch ballot images',
        async ({ address, apiClient: peerApi }) =>
          fetchBallotImagesFromHost(peerApi, address, input.cvrId)
      );
    },

    async getWriteInCandidates(input: {
      contestIds: ContestId[];
    }): Promise<Result<WriteInCandidateRecord[], AdjudicationError>> {
      return proxy(
        'fetch write-in candidates',
        async ({ apiClient: peerApi }) => peerApi.getWriteInCandidates(input)
      );
    },

    async adjudicateCvr(
      input: AdjudicatedCvr
    ): Promise<Result<void, AdjudicationError>> {
      const connection = clientStore.getHostConnection();
      if (!connection) {
        await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
          message: 'Cannot adjudicate ballot: not connected to host.',
        });
        return err({ type: 'host-disconnect' });
      }
      try {
        const result = await connection.apiClient.adjudicateCvr({
          ...input,
          machineId: getMachineConfig().machineId,
        });
        if (result.isErr()) return result;
      } catch {
        await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
          message: 'Error during adjudicate ballot: lost connection to host.',
        });
        return err({ type: 'host-disconnect' });
      }
      await logger.logAsCurrentRole(
        LogEventId.AdminBallotAdjudicationComplete,
        {
          message: `Ballot ${input.cvrId} adjudication completed.`,
          disposition: 'success',
        }
      );
      return ok();
    },

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(clientStore));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(clientStore), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(clientStore));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(clientStore),
        input
      );
    },

    getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDriveAdapter.status();
    },

    async ejectUsbDrive(): Promise<void> {
      return await usbDriveAdapter.eject();
    },

    async formatUsbDrive(): Promise<Result<void, Error>> {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(clientStore)
      );
      if (!isSystemAdministratorAuth(authStatus)) {
        return err(
          new Error('Formatting USB drive requires system administrator auth.')
        );
      }

      try {
        await usbDriveAdapter.format('fat32');
        return ok();
      } catch (error) {
        return err(error as Error);
      }
    },

    // @coverage-exclude
    async generateSignedHashValidationQrCodeValue() {
      const { codeVersion } = getMachineConfig();
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);
      const electionRecord = clientStore.getCachedElectionRecord();
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord,
        softwareVersion: codeVersion,
      });
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
        disposition: 'success',
      });
      return qrCodeValue;
    },
    /* istanbul ignore stop */

    ...createSystemCallApi({
      usbDrive: usbDriveAdapter,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
      workspacePath: workspace.path,
      // @coverage-exclude
      getAuthStatus: () =>
        auth.getAuthStatus(constructAuthMachineState(clientStore)),
    }),
    /* istanbul ignore stop */
  });
}

/**
 * A type to be used by the frontend to create a Grout API client for client
 * mode.
 */
export type ClientApi = ReturnType<typeof buildClientApi>;

/**
 * Builds an express application for client mode.
 */
export function buildClientApp({
  auth,
  workspace,
  machineMode,
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
  machineMode: MachineModeController;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}): Application {
  const app: Application = express();
  const api = buildClientApi({
    auth,
    workspace,
    machineMode,
    logger,
    multiUsbDrive,
  });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
