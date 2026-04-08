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
  BallotStyleGroupId,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  Id,
  Side,
  SystemSettings,
} from '@votingworks/types';
import { getMachineConfig } from './machine_config';
import { readMachineMode, writeMachineMode } from './machine_mode';
import {
  type MachineMode,
  BallotPageImage,
  ClientConnectionStatus,
  ElectionRecord,
  AdjudicatedCvrContest,
  BallotAdjudicationData,
  BallotImages,
  AdjudicationError,
  WriteInCandidateRecord,
} from './types';
import { type HostConnection } from './client_store';
import type { PeerApi } from './peer_app';
import { type ClientWorkspace } from './util/workspace';
import { constructAuthMachineState } from './util/auth';

/**
 * Network connection status as returned to the frontend.
 */
export type NetworkConnectionStatus =
  | { status: 'offline' }
  | { status: 'online-waiting-for-host' }
  | { status: 'online-connected-to-host'; hostMachineId: string }
  | { status: 'online-multiple-hosts-detected' };

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
  /* istanbul ignore next - image fetch failure @preserve */
  if (!response.ok) return undefined;
  /* istanbul ignore next - content-type fallback @preserve */
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
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
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
    // return the first drive
    (drives) => drives[0]?.devPath
  );

  return grout.createApi({
    getMachineConfig,

    getMachineMode(): MachineMode {
      return readMachineMode(workspace.path);
    },

    async setMachineMode(input: { mode: MachineMode }): Promise<void> {
      assert(
        clientStore.getCurrentElectionId() === undefined,
        'Cannot change machine mode while an election is configured.'
      );
      writeMachineMode(workspace.path, input.mode);
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
        /* istanbul ignore next - @preserve */
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

    async claimBallot(input: {
      currentBallotStyleId?: BallotStyleGroupId;
      excludeCvrIds?: Id[];
    }): Promise<Result<Optional<Id>, AdjudicationError>> {
      return proxy('claim ballot', async ({ apiClient: peerApi }) => {
        const cvrId = await peerApi.claimBallot({
          machineId: getMachineConfig().machineId,
          currentBallotStyleId: input.currentBallotStyleId,
          excludeCvrIds: input.excludeCvrIds,
        });
        if (cvrId) {
          await logger.logAsCurrentRole(LogEventId.AdminBallotClaimed, {
            message: `Claimed ballot ${cvrId}.`,
            disposition: 'success',
          });
        }
        return cvrId;
      });
    },

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

    async getBallotAdjudicationData(input: {
      cvrId: Id;
    }): Promise<Result<BallotAdjudicationData, AdjudicationError>> {
      return proxy('fetch ballot data', async ({ apiClient: peerApi }) =>
        peerApi.getBallotAdjudicationData({ cvrId: input.cvrId })
      );
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

    async getWriteInCandidates(
      input: { contestId?: ContestId } = {}
    ): Promise<Result<WriteInCandidateRecord[], AdjudicationError>> {
      return proxy(
        'fetch write-in candidates',
        async ({ apiClient: peerApi }) => peerApi.getWriteInCandidates(input)
      );
    },

    async adjudicateCvrContest(
      input: AdjudicatedCvrContest
    ): Promise<Result<void, AdjudicationError>> {
      const connection = clientStore.getHostConnection();
      if (!connection) {
        await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
          message: 'Cannot adjudicate contest: not connected to host.',
        });
        return err({ type: 'host-disconnect' });
      }
      try {
        const result = await connection.apiClient.adjudicateCvrContest({
          ...input,
          machineId: getMachineConfig().machineId,
        });
        if (result.isErr()) return result;
      } catch {
        await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
          message: 'Error during adjudicate contest: lost connection to host.',
        });
        return err({ type: 'host-disconnect' });
      }
      await logger.logAsCurrentRole(LogEventId.AdminContestAdjudicated, {
        message: `Adjudicated contest ${input.contestId} on ballot ${input.cvrId}.`,
        disposition: 'success',
      });
      return ok();
    },

    async setCvrResolved(input: {
      cvrId: Id;
    }): Promise<Result<void, AdjudicationError>> {
      const connection = clientStore.getHostConnection();
      if (!connection) {
        await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
          message: 'Cannot resolve ballot: not connected to host.',
        });
        return err({ type: 'host-disconnect' });
      }
      try {
        const result = await connection.apiClient.setCvrResolved({
          machineId: getMachineConfig().machineId,
          cvrId: input.cvrId,
        });
        if (result.isErr()) return result;
      } catch {
        await logger.logAsCurrentRole(LogEventId.AdminAdjudicationProxyError, {
          message: 'Error during resolve ballot: lost connection to host.',
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
        await usbDriveAdapter.format();
        return ok();
      } catch (error) {
        return err(error as Error);
      }
    },

    /* istanbul ignore next - @preserve */
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

    ...createSystemCallApi({
      usbDrive: usbDriveAdapter,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
      workspacePath: workspace.path,
    }),
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
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}): Application {
  const app: Application = express();
  const api = buildClientApi({ auth, workspace, logger, multiUsbDrive });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
