/* istanbul ignore file - scratch implementation for demo - @preserve */

import util from 'node:util';

import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { isCardlessVoterAuth } from '@votingworks/utils';
import { find } from '@votingworks/basics';

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
 * [BMD Demo] On any barcode scan event, simulate selecting a ballot style
 * and starting a voter session.
 * https://github.com/votingworks/vxsuite/issues/6864
 */
export function setUpBarcodeDemo(ctx: Context): void {
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

    // [TODO] Re-enable when we figure out how to turn the barcode scanneer's
    // beeps off:
    // void ctx.audioPlayer.play('success');

    await ctx.auth.startCardlessVoterSession(
      constructAuthMachineState(ctx.workspace),
      {
        ballotStyleId: ballotStyle.id,
        precinctId,
      }
    );
  });

  ctx.logger.log(LogEventId.Info, 'system', {
    message: 'listening for barcode scans...',
  });
}
