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
  BallotStyleGroupId,
  ContestId,
  type Id,
  type Side,
  type SystemSettings,
  type UserRole,
} from '@votingworks/types';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import {
  AdjudicationError,
  ElectionRecord,
  MachineConfig,
  AdjudicatedCvrContest,
  BallotAdjudicationData,
  BallotImages,
  WriteInCandidateRecord,
} from './types';
import { rootDebug } from './util/debug';
import { adjudicateCvrContest } from './adjudication';
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

function buildPeerApi({ workspace, logger }: PeerAppContext) {
  const { store } = workspace;

  return grout.createApi({
    connectToHost(input: {
      machineId: string;
      status: Admin.ClientMachineStatus;
      authType: UserRole | null;
    }): MachineConfig & { isClientAdjudicationEnabled: boolean } {
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
      store.setNetworkedMachineStatus(
        input.machineId,
        'client',
        input.status,
        input.authType
      );
      return {
        ...getMachineConfig(),
        isClientAdjudicationEnabled: store.getIsClientAdjudicationEnabled(),
      };
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

    claimBallot(input: {
      machineId: string;
      currentBallotStyleId?: BallotStyleGroupId;
      excludeCvrIds?: Id[];
    }): Optional<Id> {
      const electionId = assertDefined(store.getCurrentElectionId());
      const cvrId = store.claimBallotForClient({
        electionId,
        machineId: input.machineId,
        preferredBallotStyleId: input.currentBallotStyleId,
        excludeCvrIds: input.excludeCvrIds,
      });
      logger.log(LogEventId.AdminBallotClaimed, 'system', {
        message: cvrId
          ? `Client ${input.machineId} claimed ballot ${cvrId}.`
          : `Client ${input.machineId} requested a ballot but none available.`,
        disposition: cvrId ? 'success' : 'failure',
        clientMachineId: input.machineId,
      });
      return cvrId;
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

    getBallotAdjudicationData(input: { cvrId: Id }): BallotAdjudicationData {
      const electionId = assertDefined(store.getCurrentElectionId());
      return store.getBallotAdjudicationData({
        electionId,
        cvrId: input.cvrId,
      });
    },

    getBallotImageMetadata(input: { cvrId: Id }): Promise<BallotImages> {
      return getBallotImageMetadata({
        store,
        cvrId: input.cvrId,
        buildImageUrl: (side) => `/api/ballot-image/${input.cvrId}/${side}`,
      });
    },

    getWriteInCandidates(
      input: { contestId?: ContestId } = {}
    ): WriteInCandidateRecord[] {
      const electionId = assertDefined(store.getCurrentElectionId());
      return store.getWriteInCandidates({ electionId, ...input });
    },

    adjudicateCvrContest(
      input: AdjudicatedCvrContest & { machineId: string }
    ): Result<void, AdjudicationError> {
      const electionId = assertDefined(store.getCurrentElectionId());
      if (
        !store.hasBallotClaim({
          electionId,
          cvrId: input.cvrId,
          machineId: input.machineId,
        })
      ) {
        return err({ type: 'no-claim' });
      }
      adjudicateCvrContest(input, store, logger);
      return ok();
    },

    setCvrResolved(input: {
      machineId: string;
      cvrId: Id;
    }): Result<void, AdjudicationError> {
      const electionId = assertDefined(store.getCurrentElectionId());
      if (
        !store.hasBallotClaim({
          electionId,
          cvrId: input.cvrId,
          machineId: input.machineId,
        })
      ) {
        return err({ type: 'no-claim' });
      }
      store.setCvrResolved(input);
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
 * Builds the peer API express application for the host.
 */
export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();
  const { store } = context.workspace;

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
      /* istanbul ignore next - corrupted image data @preserve */
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
