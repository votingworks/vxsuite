import express, { Application } from 'express';
import { createWriteStream } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { sha256 } from 'js-sha256';
import * as grout from '@votingworks/grout';
import {
  assert,
  assertDefined,
  err,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import { getEntries, openZip } from '@votingworks/utils';
import { readCastVoteRecordFromDirectory } from '@votingworks/backend';
import {
  Admin,
  type CastVoteRecordExportMetadata,
  ContestId,
  type ElectionDefinition,
  type Id,
  type MarkThresholds,
  type Side,
  type SystemSettings,
  type UserRole,
} from '@votingworks/types';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import {
  AdjudicationError,
  CvrFileMode,
  ElectionRecord,
  MachineConfig,
  AdjudicatedCvr,
  BallotAdjudicationData,
  BallotImages,
  WriteInCandidateRecord,
} from './types';
import { rootDebug } from './util/debug';
import { adjudicateCvr } from './adjudication';
import { importCastVoteRecord } from './cast_vote_records';
import {
  getBallotImageBuffer,
  getBallotImageMetadata,
} from './util/adjudication';

const debug = rootDebug.extend('peer-app');

/**
 * Context for the peer API server.
 */
export interface PeerAppContext {
  workspace: Workspace;
  logger: BaseLogger;
}

/**
 * An in-progress cast vote record transfer from a central scanner.
 */
interface CvrTransferSession {
  importId: Id;
  electionId: Id;
  electionDefinition: ElectionDefinition;
  adminAdjudicationReasons: SystemSettings['adminAdjudicationReasons'];
  markThresholds: MarkThresholds;
  batchIds: Set<string>;
  precinctIds: Set<string>;
  newlyAdded: number;
  alreadyPresent: number;
}

/**
 * An error starting a cast vote record transfer.
 */
export type StartCvrTransferError =
  | { type: 'no-election-configured' }
  | { type: 'invalid-mode'; currentMode: Exclude<CvrFileMode, 'unlocked'> };

function buildPeerApi(
  { workspace, logger }: PeerAppContext,
  cvrTransferSessions: Map<Id, CvrTransferSession>
) {
  const { store } = workspace;

  return grout.createApi({
    connectToHost(input: {
      machineId: string;
      codeVersion: string;
      status: Admin.ClientMachineStatus;
      authType: UserRole | null;
    }): MachineConfig & { isClientAdjudicationEnabled: boolean } {
      const machineConfig = getMachineConfig();
      // Refuse to register a client running a different code version.
      if (input.codeVersion !== machineConfig.codeVersion) {
        logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: `Rejected connection from client ${input.machineId}: incompatible software version (client ${input.codeVersion}, host ${machineConfig.codeVersion}).`,
          disposition: 'failure',
          clientMachineId: input.machineId,
          clientCodeVersion: input.codeVersion,
          hostCodeVersion: machineConfig.codeVersion,
        });
        return { ...machineConfig, isClientAdjudicationEnabled: false };
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
        'client',
        input.status,
        input.authType
      );
      return {
        ...machineConfig,
        isClientAdjudicationEnabled: store.getIsClientAdjudicationEnabled(),
      };
    },

    registerScanner(input: {
      machineId: string;
      codeVersion: string;
    }): MachineConfig & { isCompatible: boolean } {
      const machineConfig = getMachineConfig();
      // Refuse to register a scanner running a different code version.
      if (input.codeVersion !== machineConfig.codeVersion) {
        logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: `Rejected connection from central scanner ${input.machineId}: incompatible software version (scanner ${input.codeVersion}, host ${machineConfig.codeVersion}).`,
          disposition: 'failure',
          scannerMachineId: input.machineId,
          scannerCodeVersion: input.codeVersion,
          hostCodeVersion: machineConfig.codeVersion,
        });
        return { ...machineConfig, isCompatible: false };
      }
      const previous = store.getMachine(input.machineId);
      if (
        !previous ||
        previous.status !== Admin.ClientMachineStatus.Active ||
        previous.machineMode !== 'scanner'
      ) {
        logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: `Central scanner ${input.machineId} connected to host.`,
          scannerMachineId: input.machineId,
        });
      }
      store.setNetworkedMachineStatus(
        input.machineId,
        'scanner',
        Admin.ClientMachineStatus.Active
      );
      return { ...machineConfig, isCompatible: true };
    },

    /**
     * Starts a cast vote record transfer from a central scanner. Records the scanner's batches
     * and creates the import record that individual cast vote records, sent one at a time to the
     * `/api/cvr-transfer/:sessionId/cvr` endpoint, are added to.
     */
    startCvrTransfer(input: {
      machineId: string;
      batchManifest: CastVoteRecordExportMetadata['batchManifest'];
      isTestMode: boolean;
    }): Result<{ sessionId: Id }, StartCvrTransferError> {
      const electionId = store.getCurrentElectionId();
      if (!electionId) {
        return err({ type: 'no-election-configured' });
      }
      const { electionDefinition } = assertDefined(
        store.getElection(electionId)
      );

      // Ensure that the records to be imported match the mode (test vs. official) of previously
      // imported records
      const currentMode = store.getCurrentCvrFileModeForElection(electionId);
      const mode: CvrFileMode = input.isTestMode ? 'test' : 'official';
      if (currentMode !== 'unlocked' && mode !== currentMode) {
        return err({ type: 'invalid-mode', currentMode });
      }

      const { adminAdjudicationReasons, markThresholds } = assertDefined(
        store.getSystemSettings(electionId)
      );

      const importId = uuid();
      const exportedTimestamp = new Date().toISOString();
      const filename = `network-transfer__machine_${input.machineId}__${exportedTimestamp}`;
      store.withTransaction(() => {
        const scannerIds = new Set<string>();
        const pollingPlaceIds = new Set<string>();
        for (const batch of input.batchManifest) {
          store.addScannerBatch({
            batchId: batch.id,
            electionId,
            label: batch.label,
            scannerId: batch.scannerId,
            ballotCastingMode: batch.ballotCastingMode,
            startedAt: batch.startTime,
          });
          scannerIds.add(batch.scannerId);
          pollingPlaceIds.add(batch.pollingPlaceId);
        }
        store.addCastVoteRecordFileRecord({
          id: importId,
          electionId,
          exportedTimestamp,
          filename,
          isTestMode: input.isTestMode,
          pollingPlaceIds,
          scannerIds,
          sha256Hash: sha256(`${importId}-${filename}`),
        });
      });

      cvrTransferSessions.set(importId, {
        importId,
        electionId,
        electionDefinition,
        adminAdjudicationReasons,
        markThresholds,
        batchIds: new Set(input.batchManifest.map((batch) => batch.id)),
        precinctIds: new Set(),
        newlyAdded: 0,
        alreadyPresent: 0,
      });
      logger.log(LogEventId.ImportCastVoteRecordsInit, 'system', {
        message: `Started receiving cast vote records from central scanner ${input.machineId} over the network...`,
        scannerMachineId: input.machineId,
      });
      return ok({ sessionId: importId });
    },

    /**
     * Completes a cast vote record transfer from a central scanner, returning the final counts.
     */
    finishCvrTransfer(input: {
      sessionId: Id;
    }): Result<
      { newlyAdded: number; alreadyPresent: number },
      { type: 'session-not-found' }
    > {
      const session = cvrTransferSessions.get(input.sessionId);
      if (!session) {
        return err({ type: 'session-not-found' });
      }
      store.updateCastVoteRecordFileRecord({
        id: session.importId,
        precinctIds: session.precinctIds,
      });
      cvrTransferSessions.delete(input.sessionId);
      logger.log(LogEventId.ImportCastVoteRecordsComplete, 'system', {
        disposition: 'success',
        message: `Successfully imported ${session.newlyAdded} cast vote record(s) received over the network. Ignored ${session.alreadyPresent} duplicate(s).`,
      });
      return ok({
        newlyAdded: session.newlyAdded,
        alreadyPresent: session.alreadyPresent,
      });
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
    }): { cvrId: Id; data: BallotAdjudicationData } | undefined {
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
      return value;
    },

    releaseBallot(input: { machineId: string; cvrId: Id }): void {
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
}

/**
 * A type to be used by clients to create a Grout API client for the peer API.
 */
export type PeerApi = ReturnType<typeof buildPeerApi>;

const VALID_SIDES: ReadonlySet<string> = new Set<Side>(['front', 'back']);

/**
 * Extracts a zip file to a directory, preserving the directory structure of
 * the entries. Rejects entries whose paths would escape the destination
 * directory.
 */
async function extractZipToDirectory(
  zipPath: string,
  destinationPath: string
): Promise<void> {
  const zipFile = await openZip(await readFile(zipPath));
  for (const entry of getEntries(zipFile)) {
    const entryPath = path.normalize(entry.name);
    assert(
      !entryPath.startsWith('..') && !path.isAbsolute(entryPath),
      `Unsafe zip entry path: ${entry.name}`
    );
    const destination = path.join(destinationPath, entryPath);
    if (entry.dir) {
      await mkdir(destination, { recursive: true });
    } else {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await entry.async('nodebuffer'));
    }
  }
}

/**
 * Builds the peer API express application for the host.
 */
export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();
  const { store } = context.workspace;
  const cvrTransferSessions = new Map<Id, CvrTransferSession>();

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

  // Receives a single cast vote record from a central scanner as part of a transfer session
  // started via the startCvrTransfer peer API method. The request body is a zip of the cast
  // vote record's directory (report JSON, images, and layouts), exactly as it would be laid
  // out in a cast vote record export.
  app.post('/api/cvr-transfer/:sessionId/cvr', async (req, res) => {
    const session = cvrTransferSessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'session-not-found' });
      return;
    }
    const workingDirectory = await mkdtemp(
      path.join(tmpdir(), 'cvr-transfer-')
    );
    try {
      const zipPath = path.join(workingDirectory, 'cvr.zip');
      await pipeline(req, createWriteStream(zipPath));
      const extractedDirectoryPath = path.join(workingDirectory, 'extracted');
      await extractZipToDirectory(zipPath, extractedDirectoryPath);
      const castVoteRecordDirectoryNames = (
        await readdir(extractedDirectoryPath, { withFileTypes: true })
      )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      if (castVoteRecordDirectoryNames.length !== 1) {
        res.status(400).json({ error: 'invalid-zip-contents' });
        return;
      }
      const readResult = await readCastVoteRecordFromDirectory(
        path.join(
          extractedDirectoryPath,
          assertDefined(castVoteRecordDirectoryNames[0])
        ),
        session.batchIds
      );
      if (readResult.isErr()) {
        res.status(400).json({ error: readResult.err() });
        return;
      }
      const importResult = await store.withTransaction(() =>
        importCastVoteRecord(
          {
            store,
            electionId: session.electionId,
            electionDefinition: session.electionDefinition,
            adminAdjudicationReasons: session.adminAdjudicationReasons,
            markThresholds: session.markThresholds,
            cvrFileId: session.importId,
          },
          readResult.ok()
        )
      );
      if (importResult.isErr()) {
        context.logger.log(LogEventId.ImportCastVoteRecordsComplete, 'system', {
          disposition: 'failure',
          message:
            'Error importing a cast vote record received over the network.',
          errorDetails: JSON.stringify(importResult.err()),
        });
        res.status(400).json({ error: importResult.err() });
        return;
      }
      const { isNew, precinctId } = importResult.ok();
      if (isNew) {
        session.newlyAdded += 1;
      } else {
        session.alreadyPresent += 1;
      }
      session.precinctIds.add(precinctId);
      res.json({ isNew });
    } catch (error) {
      debug('Error handling cast vote record transfer: %O', error);
      res.status(500).json({ error: 'transfer-failed' });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  const api = buildPeerApi(context, cvrTransferSessions);
  app.use('/api', grout.buildRouter(api, express));
  context.logger.log(LogEventId.AdminNetworkStatus, 'system', {
    message: 'Peer API server initialized.',
  });
  return app;
}
