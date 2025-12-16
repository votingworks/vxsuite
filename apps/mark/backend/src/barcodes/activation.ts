import util from 'node:util';

import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { isCardlessVoterAuth } from '@votingworks/utils';
import { find } from '@votingworks/basics';
import { SystemSettings, DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';

import { Client } from './client';
import { Workspace } from '../util/workspace';
import { constructAuthMachineState } from '../util/auth';
import { Player as AudioPlayer } from '../audio/player';

interface Context {
  audioPlayer?: AudioPlayer;
  auth: InsertedSmartCardAuthApi;
  barcodeClient?: Client;
  logger: Logger;
  workspace: Workspace;
}

/**
 * Returns the system setting for enabling QR ballot activation.
 */
function getQrBallotActivationEnabled(
  systemSettings?: SystemSettings
): boolean {
  return (
    systemSettings?.bmdEnableQrBallotActivation ??
    DEFAULT_SYSTEM_SETTINGS.bmdEnableQrBallotActivation ??
    false
  );
}

/**
 * [BMD] On any barcode scan event, simulate selecting a ballot style
 * and starting a voter session.
 * This feature is gated behind the `bmdEnableQrBallotActivation` system setting.
 */
export function setUpBarcodeActivation(ctx: Context): void {
  if (!ctx.barcodeClient) return;

  ctx.barcodeClient.on('error', (err) => {
    ctx.logger.log(LogEventId.Info, 'system', {
      message: 'unexpected barcode reader error',
      error: util.inspect(err),
    });
  });

  ctx.barcodeClient.on('scan', async (data) => {
    ctx.logger.log(LogEventId.Info, 'system', {
      message: `got scan: ${data}`,
    });

    const barcode = new TextDecoder().decode(data);
    if (barcode.trim().length === 0) return;

    const systemSettings = ctx.workspace.store.getSystemSettings();
    if (!getQrBallotActivationEnabled(systemSettings)) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        message:
          'barcode scan detected but QR ballot activation is disabled - ignoring',
      });
    }

    const electionRecord = ctx.workspace.store.getElectionRecord();
    const pollsState = ctx.workspace.store.getPollsState();
    const precinctSelection = ctx.workspace.store.getPrecinctSelection();

    if (!electionRecord || pollsState !== 'polls_open' || !precinctSelection) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        message: 'barcode scan detected in non-active polls state - ignoring',
      });
    }

    const authStatus = await ctx.auth.getAuthStatus(
      constructAuthMachineState(ctx.workspace)
    );

    ctx.logger.log(LogEventId.Info, 'system', {
      message: `current auth status: ${authStatus.status}`,
      authStatus: JSON.stringify(authStatus),
    });

    if (isCardlessVoterAuth(authStatus)) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        message: 'barcode scan detected during voter session - ignoring',
      });
    }

    const { election } = electionRecord.electionDefinition;
    const ballotStyle = find(
      election.ballotStyles,
      (b) =>
        precinctSelection.kind === 'AllPrecincts' ||
        b.precincts.includes(precinctSelection.precinctId)
    );
    const precinctId =
      precinctSelection.kind === 'AllPrecincts'
        ? ballotStyle.precincts[0]
        : precinctSelection.precinctId;

    void ctx.logger.logAsCurrentRole(LogEventId.Info, {
      ballotStyleId: ballotStyle.id,
      disposition: 'success',
      message: 'barcode scan detected - starting voter session',
      precinctId,
    });

    try {
      const machineState = constructAuthMachineState(ctx.workspace);
      ctx.logger.log(LogEventId.Info, 'system', {
        message: `starting cardless voter session with machine state`,
        machineState: JSON.stringify(machineState),
        ballotStyleId: ballotStyle.id,
        precinctId,
      });

      await ctx.auth.startCardlessVoterSession(machineState, {
        ballotStyleId: ballotStyle.id,
        precinctId,
        skipPollWorkerCheck: true,
      });

      // Verify the session was actually started
      const newAuthStatus = await ctx.auth.getAuthStatus(machineState);
      ctx.logger.log(LogEventId.Info, 'system', {
        message: `auth status AFTER starting session: ${newAuthStatus.status}`,
        authStatusAfter: JSON.stringify(newAuthStatus),
      });

      void ctx.logger.logAsCurrentRole(LogEventId.Info, {
        message: 'voter session started successfully',
        disposition: 'success',
      });

      void ctx.audioPlayer?.play('success');
    } catch (error) {
      ctx.logger.log(LogEventId.UnknownError, 'system', {
        message: 'failed to start voter session',
        error: util.inspect(error),
        disposition: 'failure',
      });
    }
  });

  ctx.logger.log(LogEventId.Info, 'system', {
    message: 'listening for barcode scans...',
  });
}
