import { Buffer } from 'node:buffer';
import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import {
  assert,
  assertDefined,
  err,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import {
  Admin,
  ContestId,
  type Id,
  type Side,
  type SystemSettings,
  type UserRole,
} from '@votingworks/types';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import type {
  CvrTransferManifest,
  FinishCvrTransferError,
  RegisterScannerError,
  StartCvrTransferError,
  VxAdminHostApi,
} from '@votingworks/networking';
import { getMachineConfig } from './machine_config.js';
import { Workspace } from './util/workspace.js';
import {
  AdjudicationError,
  ElectionRecord,
  MachineConfig,
  RegisterAdjudicationStationError,
  AdjudicatedCvr,
  BallotAdjudicationData,
  BallotImages,
  WriteInCandidateRecord,
} from './types.js';
import { rootDebug } from './util/debug.js';
import { adjudicateCvr } from './adjudication.js';
import {
  getBallotImageBuffer,
  getBallotImageMetadata,
} from './util/adjudication.js';
import {
  finishCvrTransfer,
  NetworkCvrImportQueue,
  receiveCvrTransferUpload,
  startCvrTransfer,
} from './network_cvr_transfer.js';

const debug = rootDebug.extend('peer-app');

/**
 * Context for the peer API server.
 */
export interface PeerAppContext {
  workspace: Workspace;
  logger: BaseLogger;
  machineId: string;
}

function buildPeerApi({ workspace, logger, machineId }: PeerAppContext) {
  const { store } = workspace;
  const importQueue = new NetworkCvrImportQueue();

  // Client adjudication operations are only served while the host has client
  // adjudication enabled and is the sole host on the network. Enforced
  // server-side so a client whose UI hasn't yet observed a state change (or
  // any stale request) cannot claim or adjudicate ballots.
  function isClientAdjudicationAllowed(): boolean {
    return (
      store.getIsClientAdjudicationEnabled() &&
      !store.getMultipleHostsDetected(machineId)
    );
  }

  const api = grout.createApi({
    registerScanner(input: {
      machineId: string;
      codeVersion: string;
      ballotHash?: string;
      pollingPlaceId?: string;
    }): Result<MachineConfig, RegisterScannerError> {
      const machineConfig = getMachineConfig();

      function recordScanner(
        registrationError: RegisterScannerError['type'] | null
      ): void {
        store.setNetworkedMachineStatus(
          input.machineId,
          'scanner',
          Admin.ClientMachineStatus.Active,
          null,
          input.pollingPlaceId ?? null,
          registrationError
        );
      }

      function reject(
        error: RegisterScannerError,
        details: string,
        extra: Record<string, string> = {}
      ): Result<MachineConfig, RegisterScannerError> {
        logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: `Rejected registration from scanner ${input.machineId}: ${details}`,
          disposition: 'failure',
          scannerMachineId: input.machineId,
          error: error.type,
          ...extra,
        });
        // Still record the scanner so it can be shown, along with the
        // problem, in the host's UI.
        recordScanner(error.type);
        return err(error);
      }

      // Refuse to register a scanner running a different code version.
      if (input.codeVersion !== machineConfig.codeVersion) {
        return reject(
          { type: 'code-version-mismatch' },
          `incompatible software version (scanner ${input.codeVersion}, host ${machineConfig.codeVersion}).`,
          {
            scannerCodeVersion: input.codeVersion,
            hostCodeVersion: machineConfig.codeVersion,
          }
        );
      }
      // Refuse to register a scanner that isn't configured for the same
      // election as this host.
      if (input.ballotHash === undefined) {
        return reject(
          { type: 'scanner-unconfigured' },
          'the scanner is not configured with an election.'
        );
      }
      const currentElectionId = store.getCurrentElectionId();
      const hostBallotHash = currentElectionId
        ? assertDefined(store.getElection(currentElectionId)).electionDefinition
            .ballotHash
        : undefined;
      if (hostBallotHash === undefined) {
        return reject(
          { type: 'host-unconfigured' },
          'this host is not configured with an election.'
        );
      }
      if (input.ballotHash !== hostBallotHash) {
        return reject(
          { type: 'ballot-hash-mismatch' },
          `configured for a different election (scanner ${input.ballotHash}, host ${hostBallotHash}).`,
          {
            scannerBallotHash: input.ballotHash,
            hostBallotHash,
          }
        );
      }
      debug('Scanner %s registered with host', input.machineId);
      recordScanner(null);
      return ok(machineConfig);
    },

    registerAdjudicationStation(input: {
      machineId: string;
      codeVersion: string;
      status: Admin.ClientMachineStatus;
      authType: UserRole | null;
    }): Result<
      MachineConfig & { isClientAdjudicationEnabled: boolean },
      RegisterAdjudicationStationError
    > {
      const machineConfig = getMachineConfig();
      // Refuse to register an adjudication station running a different code
      // version.
      if (input.codeVersion !== machineConfig.codeVersion) {
        logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: `Rejected registration from adjudication station ${input.machineId}: incompatible software version (station ${input.codeVersion}, host ${machineConfig.codeVersion}).`,
          disposition: 'failure',
          clientMachineId: input.machineId,
          clientCodeVersion: input.codeVersion,
          hostCodeVersion: machineConfig.codeVersion,
        });
        // Still record the station so it can be shown, along with the
        // problem, in the host's UI.
        store.setNetworkedMachineStatus(
          input.machineId,
          'admin-client',
          input.status,
          input.authType,
          null,
          'code-version-mismatch'
        );
        return err({ type: 'code-version-mismatch' });
      }
      debug(
        'Client %s connected to host (election: %s, status: %s)',
        input.machineId,
        store.getCurrentElectionId() ?? 'none',
        input.status
      );
      const previous = store.getMachine(input.machineId);
      if (
        previous?.status !== input.status ||
        previous?.authType !== input.authType
      ) {
        logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: previous
            ? `Client ${input.machineId} status changed from ${previous.status} to ${input.status}.`
            : `New client ${input.machineId} connected to host with status ${input.status}.`,
          clientMachineId: input.machineId,
          previousStatus: previous?.status ?? 'unknown',
          newStatus: input.status,
          previousAuthType: previous?.authType ?? 'none',
          newAuthType: input.authType ?? 'none',
        });
      }
      // When a client transitions to locked (manual logout or session expiry),
      // release any ballot claims it still holds. Mirrors the disconnect-side
      // cleanup in cleanupStaleMachines for the still-connected case.
      if (
        previous?.status !== Admin.ClientMachineStatus.OnlineLocked &&
        input.status === Admin.ClientMachineStatus.OnlineLocked
      ) {
        const electionId = store.getCurrentElectionId();
        if (electionId) {
          store.releaseAllBallotClaimsForMachine({
            electionId,
            machineId: input.machineId,
          });
        }
      }
      store.setNetworkedMachineStatus(
        input.machineId,
        'admin-client',
        input.status,
        input.authType
      );
      return ok({
        ...machineConfig,
        isClientAdjudicationEnabled: store.getIsClientAdjudicationEnabled(),
      });
    },

    startCvrTransfer(
      input: CvrTransferManifest & { codeVersion: string; ballotHash: string }
    ): Promise<Result<{ alreadyComplete: boolean }, StartCvrTransferError>> {
      return startCvrTransfer({ workspace, logger }, input);
    },

    finishCvrTransfer(input: {
      machineId: string;
      batchId: string;
    }): Promise<Result<{ cvrCount: number }, FinishCvrTransferError>> {
      return finishCvrTransfer({ workspace, logger, importQueue }, input);
    },

    getElectionPackageHash(): Optional<string> {
      const currentElectionId = store.getCurrentElectionId();
      if (!currentElectionId) return undefined;
      const record = store.getElection(currentElectionId);
      assert(record);
      return record.electionPackageHash;
    },

    getCurrentElectionMetadata(): Optional<ElectionRecord> {
      const currentElectionId = store.getCurrentElectionId();
      if (!currentElectionId) return undefined;
      const record = store.getElection(currentElectionId);
      assert(record);
      return record;
    },

    getSystemSettings(): Optional<SystemSettings> {
      const currentElectionId = store.getCurrentElectionId();
      if (!currentElectionId) return undefined;
      return store.getSystemSettings(currentElectionId);
    },

    claimAndLoadBallot(input: {
      machineId: string;
      afterCvrId?: Id;
    }): Result<
      { cvrId: Id; data: BallotAdjudicationData } | undefined,
      AdjudicationError
    > {
      if (!isClientAdjudicationAllowed()) {
        logger.log(LogEventId.AdminBallotClaimed, 'system', {
          message: `Rejected ballot claim from client ${input.machineId}: client adjudication is not allowed.`,
          disposition: 'failure',
          clientMachineId: input.machineId,
        });
        return err({ type: 'adjudication-disabled' });
      }
      const electionId = assertDefined(store.getCurrentElectionId());
      const result = store.claimAndLoadBallotData({
        electionId,
        machineId: input.machineId,
        afterCvrId: input.afterCvrId,
      });
      const value = result.unsafeUnwrap(); // error case is unreachable here.
      logger.log(LogEventId.AdminBallotClaimed, 'system', {
        message: value
          ? `Client ${input.machineId} claimed ballot ${value.cvrId}.`
          : `Client ${input.machineId} requested a ballot but none available.`,
        disposition: value ? 'success' : 'failure',
        clientMachineId: input.machineId,
      });
      return ok(value);
    },

    releaseBallot(input: { machineId: string; cvrId: Id }): void {
      // When client adjudication is not allowed, claims are managed by the
      // host (released on toggle / multi-host detection), so a stale release
      // request is a no-op rather than an error.
      if (!isClientAdjudicationAllowed()) {
        debug(
          'Ignoring release of ballot %s from client %s: client adjudication is not allowed',
          input.cvrId,
          input.machineId
        );
        return;
      }
      const electionId = assertDefined(store.getCurrentElectionId());
      store.releaseBallotClaim({
        electionId,
        cvrId: input.cvrId,
        machineId: input.machineId,
      });
      logger.log(LogEventId.AdminBallotReleased, 'system', {
        message: `Client ${input.machineId} released ballot ${input.cvrId}.`,
        cvrId: input.cvrId,
        clientMachineId: input.machineId,
      });
    },

    getBallotImageMetadata(input: { cvrId: Id }): Promise<BallotImages> {
      return getBallotImageMetadata({
        store,
        cvrId: input.cvrId,
        buildImageUrl: (side) => `/api/ballot-image/${input.cvrId}/${side}`,
      });
    },

    getWriteInCandidates(input: {
      contestIds: ContestId[];
    }): WriteInCandidateRecord[] {
      const electionId = assertDefined(store.getCurrentElectionId());
      return store.getWriteInCandidates({ electionId, ...input });
    },

    adjudicateCvr(
      input: AdjudicatedCvr & { machineId: string }
    ): Result<void, AdjudicationError> {
      if (!isClientAdjudicationAllowed()) {
        logger.log(LogEventId.AdminBallotAdjudicationComplete, 'system', {
          message: `Rejected adjudication of ballot ${input.cvrId} from client ${input.machineId}: client adjudication is not allowed.`,
          disposition: 'failure',
          cvrId: input.cvrId,
          clientMachineId: input.machineId,
        });
        return err({ type: 'adjudication-disabled' });
      }
      const electionId = assertDefined(store.getCurrentElectionId());
      if (
        !store.hasBallotClaim({
          electionId,
          cvrId: input.cvrId,
          machineId: input.machineId,
        })
      ) {
        return err({ type: 'claim-failed' });
      }
      adjudicateCvr(input, input.machineId, store, logger);
      logger.log(LogEventId.AdminBallotAdjudicationComplete, 'system', {
        message: `Ballot ${input.cvrId} adjudication completed.`,
        disposition: 'success',
        cvrId: input.cvrId,
      });
      return ok();
    },
  });

  // The peer API implements the scanner-facing contract shared in
  // libs/networking; this fails to compile if the two drift apart. Methods
  // may return richer types than the contract requires.
  return api satisfies VxAdminHostApi;
}

/**
 * A type to be used by clients to create a Grout API client for the peer API.
 */
export type PeerApi = ReturnType<typeof buildPeerApi>;

const VALID_SIDES: ReadonlySet<string> = new Set<Side>(['front', 'back']);

/**
 * Builds the peer API express application for the host.
 */
export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();
  const { store } = context.workspace;

  // Per-CVR upload endpoint for network CVR transfers. Raw (non-grout)
  // because the body is a zip of the cast vote record's file set.
  app.post(
    '/api/cvr-transfer/:scannerId/:batchId/:cvrId',
    express.raw({ type: 'application/zip', limit: '20mb' }),
    async (req, res) => {
      const { scannerId, batchId, cvrId } = req.params;
      if (!Buffer.isBuffer(req.body)) {
        res
          .status(400)
          .json({ error: 'expected an application/zip request body' });
        return;
      }
      const result = await receiveCvrTransferUpload(
        { workspace: context.workspace },
        {
          scannerId,
          batchId,
          castVoteRecordId: cvrId,
          zipData: req.body,
        }
      );
      if (result.isErr()) {
        context.logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: `Rejected cast vote record ${cvrId} of batch ${batchId} from scanner ${scannerId}: ${result.err()}.`,
          disposition: 'failure',
          scannerMachineId: scannerId,
          batchId,
          castVoteRecordId: cvrId,
          error: result.err(),
        });
        res.status(400).json({ error: result.err() });
        return;
      }
      res.json({ success: true });
    }
  );

  // Binary ballot image endpoint — serves raw image bytes
  app.get('/api/ballot-image/:cvrId/:side', async (req, res) => {
    const { cvrId, side } = req.params;
    if (!VALID_SIDES.has(side)) {
      res.status(400).json({ error: 'side must be "front" or "back"' });
      return;
    }
    try {
      const result = await getBallotImageBuffer({
        store,
        cvrId,
        side: side as Side,
      });
      /* istanbul ignore next - corrupted image data */
      if (!result) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      res.setHeader('Content-Type', result.contentType);
      res.send(result.buffer);
    } catch (error) {
      debug('Error fetching ballot image: %O', error);
      res.status(404).json({ error: 'Ballot not found' });
    }
  });

  const api = buildPeerApi(context);
  app.use('/api', grout.buildRouter(api, express));
  context.logger.log(LogEventId.AdminNetworkStatus, 'system', {
    message: 'Peer API server initialized.',
  });
  return app;
}
