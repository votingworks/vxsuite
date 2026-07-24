import util from 'node:util';

import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { isCardlessVoterAuth } from '@votingworks/utils';
import {
  assertDefined,
  Result,
  err,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  BallotStyle,
  BallotStyleId,
  PrecinctId,
  getBallotStyle,
  pollingPlaceFromElection,
} from '@votingworks/types';

import {
  BarcodeReader,
  BallotStyleQrCode,
  BallotStyleQrCodeSchema,
} from './types';
import { Workspace } from '../util/workspace';
import { constructAuthMachineState } from '../util/auth';
import { Player as AudioPlayer } from '../audio/player';

interface Context {
  audioPlayer?: AudioPlayer;
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
 * [BMD] On a barcode scan event, parse the scanned QR code for a ballot style
 * ID and resolve it against the configured polling place. What happens next
 * depends on the `barcode_activation_mode` store setting:
 * - `voter_session`: start a cardless voter session for that ballot style.
 * - `ballot_printing`: do nothing here; the raw scan is surfaced to the
 *   frontend via `getMostRecentBarcodeScan` for the ballot printing screen.
 * This feature is gated behind the `bmdEnableQrBallotActivation` system setting.
 */
export function setUpBarcodeActivation(ctx: Context): void {
  if (!ctx.barcodeClient) return;

  ctx.barcodeClient.on('error', (error) => {
    ctx.logger.log(LogEventId.Info, 'system', {
      message: 'unexpected barcode reader error',
      error: util.inspect(error),
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

    if (isCardlessVoterAuth(authStatus)) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        message: 'barcode scan detected during voter session - ignoring',
      });
    }

    const { election } = electionRecord.electionDefinition;

    const parseResult = parseBallotStyleQrCode(barcode);
    if (parseResult.isErr()) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        disposition: 'failure',
        message: `barcode scan could not be parsed as a ballot style QR code - ignoring: ${
          parseResult.err().message
        }`,
      });
    }
    const {
      ballotStyleId: scannedBallotStyleId,
      precinctId: scannedPrecinctId,
    } = parseResult.ok();

    const resolved = resolveBallotStyleForPollingPlace(
      election,
      pollingPlaceId,
      scannedBallotStyleId,
      scannedPrecinctId
    );
    if (!resolved) {
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        ballotStyleId: scannedBallotStyleId,
        disposition: 'failure',
        message: `scanned ballot style is not valid for the configured polling place - ignoring`,
      });
    }
    const { ballotStyle, precinctId } = resolved;

    const activationMode = ctx.workspace.store.getBarcodeActivationMode();
    if (activationMode === 'ballot_printing') {
      // Do not start a voter session. The raw scan is already surfaced via
      // getMostRecentBarcodeScan (see the diagnostic listener in app.ts), which
      // the frontend ballot printing screen polls.
      return ctx.logger.logAsCurrentRole(LogEventId.Info, {
        ballotStyleId: ballotStyle.id,
        disposition: 'success',
        message: 'barcode scan detected - surfacing for ballot printing',
      });
    }
    /* istanbul ignore next */
    if (activationMode !== 'voter_session') {
      throwIllegalValue(activationMode);
    }

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

/**
 * Parses a scanned barcode string into a {@link BallotStyleQrCode}. The scanner
 * emits the QR code's textual contents, which we expect to be JSON of the form
 * `{"ballotStyleId":"<id>"}`.
 */
function parseBallotStyleQrCode(
  barcode: string
): Result<BallotStyleQrCode, Error> {
  let raw: unknown;
  try {
    raw = JSON.parse(barcode);
  } catch (error) {
    return err(new Error(`invalid JSON: ${(error as Error).message}`));
  }

  const result = BallotStyleQrCodeSchema.safeParse(raw);
  return result.success
    ? ok(result.data)
    : err(new Error(result.error.message));
}

/**
 * Resolves a scanned ballot style ID against the machine's configured polling
 * place. Returns `undefined` when the scanned ballot style is not one that is
 * valid for this location, so a scan can never activate a ballot the machine
 * isn't configured to hand out.
 */
/**
 * Returns the precincts a ballot style maps to that are also part of the
 * machine's configured polling place. A scanned QR code carries only a ballot
 * style ID; this derives the precinct(s) it can be printed/activated for at this
 * location, so the frontend can auto-fill when there's exactly one or prompt
 * when there's more than one. An empty result means the ballot style is unknown
 * or not valid for this polling place.
 */
export function resolvePrecinctsForBallotStyle({
  election,
  pollingPlaceId,
  ballotStyleId,
}: {
  election: Election;
  pollingPlaceId: string;
  ballotStyleId: BallotStyleId;
}): PrecinctId[] {
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  if (!ballotStyle) return [];

  const place = pollingPlaceFromElection(election, pollingPlaceId);
  return ballotStyle.precincts.filter(
    (precinctId) => precinctId in place.precincts
  );
}

function resolveBallotStyleForPollingPlace(
  election: Election,
  placeId: string,
  ballotStyleId: BallotStyleId,
  scannedPrecinctId?: PrecinctId
): { ballotStyle: BallotStyle; precinctId: PrecinctId } | undefined {
  const validPrecinctIds = resolvePrecinctsForBallotStyle({
    election,
    pollingPlaceId: placeId,
    ballotStyleId,
  });
  if (validPrecinctIds.length === 0) return undefined;

  // A scanned precinct that isn't valid for this polling place means the scan
  // is not for this machine's location - ignore it. When no precinct is scanned,
  // fall back to the sole precinct (callers handle the ambiguous multi case).
  if (
    scannedPrecinctId !== undefined &&
    !validPrecinctIds.includes(scannedPrecinctId)
  ) {
    return undefined;
  }
  const precinctId = scannedPrecinctId ?? validPrecinctIds[0];

  // A resolved precinct guarantees the ballot style exists in the election.
  const ballotStyle = assertDefined(
    getBallotStyle({ ballotStyleId, election })
  );
  return { ballotStyle, precinctId };
}
