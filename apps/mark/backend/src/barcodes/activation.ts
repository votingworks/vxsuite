import util from 'node:util';

import type { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, type Logger } from '@votingworks/logging';
import { isPollWorkerAuth } from '@votingworks/utils';
import { assert, find } from '@votingworks/basics';
import {
  type SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  type Election,
  pollingPlaceBallotStyles,
  pollingPlaceFromElection,
} from '@votingworks/types';

import type { BarcodeReader } from './types.js';
import {
  type BallotStyleQrCode,
  parseBallotStyleQrCode,
} from './ballot_style_qr_code.js';
import type { Workspace } from '../util/workspace.js';
import { constructAuthMachineState } from '../util/auth.js';
import type { AudioPlayerInterface } from '../audio/player.js';

interface Context {
  audioPlayer?: AudioPlayerInterface;
  auth: InsertedSmartCardAuthApi;
  barcodeClient?: BarcodeReader;
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
 * [BMD] When a poll worker is logged in, starts a voter session for the ballot
 * style in a scanned QR code.
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
    const pollingPlaceId = ctx.workspace.store.getPollingPlaceId();

    const locationConfigured = !!pollingPlaceId;

    if (!electionRecord || pollsState !== 'polls_open' || !locationConfigured) {
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

    if (!isPollWorkerAuth(authStatus)) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        message:
          'barcode scan detected without a poll worker logged in - ignoring',
      });
    }

    if (authStatus.cardlessVoterUser) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        message: 'barcode scan detected during voter session - ignoring',
      });
    }

    const parseResult = parseBallotStyleQrCode(barcode);
    if (parseResult.isErr()) {
      return ctx.logger.logAsCurrentRole(LogEventId.BarcodeScanned, {
        message: 'Scanned barcode is not a ballot style QR code.',
        disposition: 'failure',
      });
    }

    const qrCode = parseResult.ok();
    const { election } = electionRecord.electionDefinition;
    const selection = ballotStyleForPollingPlace(
      election,
      qrCode,
      pollingPlaceId
    );
    if (!selection) {
      return ctx.logger.logAsCurrentRole(LogEventId.BarcodeScanned, {
        message:
          'Scanned ballot style is not available at the configured polling place.',
        disposition: 'failure',
        ballotStyleId: qrCode.ballotStyleId,
        precinctId: qrCode.precinctId,
      });
    }
    const { ballotStyle, precinctId } = selection;

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

function ballotStyleForPollingPlace(
  election: Election,
  qrCode: BallotStyleQrCode,
  placeId?: string
) {
  assert(!!placeId);
  const place = pollingPlaceFromElection(election, placeId);
  const ballotStyle = pollingPlaceBallotStyles(election, place).find(
    (bs) => bs.id === qrCode.ballotStyleId
  );
  if (!ballotStyle) return undefined;

  const precinctId =
    qrCode.precinctId ??
    find(ballotStyle.precincts, (p) => p in place.precincts);
  if (
    !ballotStyle.precincts.includes(precinctId) ||
    !(precinctId in place.precincts)
  ) {
    return undefined;
  }

  return { ballotStyle, precinctId };
}
