import util from 'node:util';
import { Buffer } from 'node:buffer';
import express, { Application } from 'express';
import {
  generateSignedHashValidationQrCodeValue,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  assert,
  assertDefined,
  find,
  iter,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  ElectionPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  PollsState,
  PrecinctSelection,
  PrinterStatus,
  formatBallotHash,
} from '@votingworks/types';
import {
  getEntries,
  getPrecinctSelectionName,
  isElectionManagerAuth,
  openZip,
  readEntry,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromUsb,
  configureUiStrings,
  createSystemCallApi,
} from '@votingworks/backend';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { Printer } from '@votingworks/printing';
import { PrintCalibration } from '@votingworks/hmpb';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { ElectionState, PrintBallotProps, PrintMode } from './types';
import { printBallot } from './util/print_ballot';
import { isAccessibleControllerAttached } from './util/accessible_controller';
import { constructAuthMachineState } from './util/auth';
import { ElectionRecord } from './store';
import * as barcodes from './barcodes';
import { setUpBarcodeDemo } from './barcodes/demo';
import { Player as AudioPlayer } from './audio/player';

async function readBallotPdfsFromUsbDrive(
  electionDefinition: ElectionDefinition,
  usbDrive: UsbDrive
): Promise<Map<[PrecinctId, BallotStyleId], Buffer>> {
  const usbDriveStatus = await usbDrive.status();
  assert(usbDriveStatus.status === 'mounted', 'No USB drive mounted');

  const ballotsZip = (
    await fs.readdir(usbDriveStatus.mountPoint, {
      withFileTypes: true,
    })
  ).find(
    (entry) =>
      entry.isFile() &&
      entry.name ===
        `ballots-${formatBallotHash(electionDefinition.ballotHash)}.zip`
  );
  // TODO do we need a user-facing error?
  assert(ballotsZip, 'No ballots zip found on USB drive');

  const zipFile = await openZip(
    await fs.readFile(join(usbDriveStatus.mountPoint, ballotsZip.name))
  );
  const ballotPdfs = new Map(
    await iter(getEntries(zipFile))
      .async()
      .filterMap(
        async (
          entry
        ): Promise<[[PrecinctId, BallotStyleId], Buffer] | null> => {
          // must be updated to be resilient to precinct names with hyphens
          const [, precinctName, ballotStyleId] =
            entry.name.match(/^official-precinct-ballot-([^-]*)-(.*)\.pdf$/) ??
            [];
          if (!(precinctName && ballotStyleId)) return null;
          const precinctId = find(
            electionDefinition.election.precincts,
            (p) => p.name === precinctName.replaceAll('_', ' ')
          ).id;
          return [[precinctId, ballotStyleId], await readEntry(entry)];
        }
      )
      .toArray()
  );
  return ballotPdfs;
}

interface Context {
  audioPlayer?: AudioPlayer;
  auth: InsertedSmartCardAuthApi;
  barcodeClient?: barcodes.Client;
  logger: Logger;
  workspace: Workspace;
  usbDrive: UsbDrive;
  printer: Printer;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: Context) {
  const { auth, logger, printer, usbDrive, workspace } = ctx;
  const { store } = workspace;

  return grout.createApi({
    getMachineConfig,

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), {
        pin: input.pin,
      });
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace));
    },

    getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDrive.status();
    },

    async ejectUsbDrive(): Promise<void> {
      return usbDrive.eject();
    },

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    getAccessibleControllerConnected(): boolean {
      return isAccessibleControllerAttached();
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(constructAuthMachineState(workspace), {
        sessionExpiresAt: input.sessionExpiresAt,
      });
    },

    startCardlessVoterSession(input: {
      ballotStyleId: BallotStyleId;
      precinctId: PrecinctId;
    }) {
      return auth.startCardlessVoterSession(
        constructAuthMachineState(workspace),
        {
          ballotStyleId: input.ballotStyleId,
          precinctId: input.precinctId,
        }
      );
    },

    updateCardlessVoterBallotStyle(input: { ballotStyleId: BallotStyleId }) {
      return auth.updateCardlessVoterBallotStyle({
        ballotStyleId: input.ballotStyleId,
      });
    },

    endCardlessVoterSession() {
      return auth.endCardlessVoterSession(constructAuthMachineState(workspace));
    },

    getElectionRecord(): ElectionRecord | null {
      return workspace.store.getElectionRecord() ?? null;
    },

    getSystemSettings(): SystemSettings {
      return workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    async unconfigureMachine() {
      workspace.store.reset();
      await logger.logAsCurrentRole(LogEventId.ElectionUnconfigured, {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election.',
      });
    },

    async configureElectionPackageFromUsb(): Promise<
      Result<ElectionDefinition, ElectionPackageConfigurationError>
    > {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );

      const electionPackageResult = await readSignedElectionPackageFromUsb(
        authStatus,
        usbDrive,
        logger
      );
      if (electionPackageResult.isErr()) {
        await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
          disposition: 'failure',
          message: 'Error configuring machine.',
          errorDetails: JSON.stringify(electionPackageResult.err()),
        });
        return electionPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const { electionPackage, electionPackageHash } =
        electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
      assert(systemSettings);

      const ballotPdfs = await readBallotPdfsFromUsbDrive(
        electionDefinition,
        usbDrive
      );

      workspace.store.withTransaction(() => {
        workspace.store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
          electionPackageHash,
        });
        workspace.store.setSystemSettings(systemSettings);

        // automatically set precinct for single precinct elections
        if (electionDefinition.election.precincts.length === 1) {
          workspace.store.setPrecinctSelection(
            singlePrecinctSelectionFor(
              electionDefinition.election.precincts[0].id
            )
          );
        }

        configureUiStrings({
          electionPackage,
          logger,
          store: workspace.store.getUiStringsStore(),
        });

        workspace.store.setBallotPdfs(ballotPdfs);
      });

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });

      return ok(electionDefinition);
    },

    ...createUiStringsApi({
      logger,
      store: workspace.store.getUiStringsStore(),
    }),

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
    }),

    async printBallot(input: PrintBallotProps) {
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);
      await printBallot({
        store,
        printer,
        ...input,
      });
    },

    async setPollsState(input: { pollsState: PollsState }) {
      const newPollsState = input.pollsState;
      const oldPollsState = store.getPollsState();

      store.setPollsState(newPollsState);

      assert(newPollsState !== 'polls_closed_initial');
      const logEvent = (() => {
        switch (newPollsState) {
          case 'polls_closed_final':
            return LogEventId.PollsClosed;
          case 'polls_paused':
            if (oldPollsState === 'polls_closed_final') {
              return LogEventId.ResetPollsToPaused;
            }
            return LogEventId.VotingPaused;
          case 'polls_open':
            if (oldPollsState === 'polls_closed_initial') {
              return LogEventId.PollsOpened;
            }
            return LogEventId.VotingResumed;
          default: {
            /* istanbul ignore next - @preserve */
            throwIllegalValue(newPollsState);
          }
        }
      })();

      await logger.logAsCurrentRole(logEvent, { disposition: 'success' });
    },

    setTestMode(input: { isTestMode: boolean }) {
      store.setTestMode(input.isTestMode);
      store.setPollsState('polls_closed_initial');
      store.setBallotsPrintedCount(0);
    },

    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      store.setPrecinctSelection(input.precinctSelection);
      store.setBallotsPrintedCount(0);
      await logger.logAsCurrentRole(LogEventId.PrecinctConfigurationChanged, {
        disposition: 'success',
        message: `User set the precinct for the machine to ${getPrecinctSelectionName(
          electionDefinition.election.precincts,
          input.precinctSelection
        )}`,
      });
    },

    getElectionState(): ElectionState {
      return {
        precinctSelection: store.getPrecinctSelection(),
        ballotsPrintedCount: store.getBallotsPrintedCount(),
        isTestMode: store.getTestMode(),
        pollsState: store.getPollsState(),
      };
    },

    async generateSignedHashValidationQrCodeValue() {
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);

      try {
        const qrCodeValue = await generateSignedHashValidationQrCodeValue({
          electionRecord: store.getElectionRecord(),
          softwareVersion: getMachineConfig().codeVersion,
        });

        await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
          disposition: 'success',
        });

        return qrCodeValue;
      } catch (err) {
        await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
          disposition: 'failure',
          message: util.inspect(err),
        });

        throw err;
      }
    },

    getPrintMode(): PrintMode {
      return store.getPrintMode();
    },

    setPrintMode(input: { mode: PrintMode }) {
      store.setPrintMode(input.mode);
    },

    getPrintCalibration(): PrintCalibration {
      return store.getPrintCalibration();
    },

    setPrintCalibration(input: PrintCalibration) {
      store.setPrintCalibration(input);
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(ctx: Context): Application {
  const app: Application = express();
  const api = buildApi(ctx);
  app.use('/api', grout.buildRouter(api, express));

  setUpBarcodeDemo(ctx);

  return app;
}
