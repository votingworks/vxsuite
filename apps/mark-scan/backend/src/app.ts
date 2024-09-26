import express, { Application } from 'express';
import {
  InsertedSmartCardAuthApi,
  generateSignedHashValidationQrCodeValue,
} from '@votingworks/auth';
import {
  assert,
  assertDefined,
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
  PrecinctSelection,
  PollsState,
  DiagnosticRecord,
  DiagnosticType,
  PageInterpretation,
} from '@votingworks/types';
import {
  getPrecinctSelectionName,
  isElectionManagerAuth,
  isPollWorkerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromUsb,
  configureUiStrings,
  createSystemCallApi,
  DiskSpaceSummary,
  ExportDataResult,
} from '@votingworks/backend';
import { LogEventId, Logger } from '@votingworks/logging';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  MockPaperHandlerStatus,
  PaperHandlerDriverInterface,
} from '@votingworks/custom-paper-handler';
import { Browser } from '@votingworks/printing';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import {
  PaperHandlerStateMachine,
  AcceptedPaperType,
  SimpleServerStatus,
  buildMockPaperHandlerApi,
} from './custom-paper-handler';
import { BmdModelNumber, ElectionState, PrintBallotProps } from './types';
import {
  getMarkScanBmdModel,
  isAccessibleControllerDaemonRunning,
} from './util/hardware';
import { saveReadinessReport } from './readiness_report';
import { renderBallot } from './util/render_ballot';
import { ElectionRecord, Store } from './store';
import { constructAuthMachineState } from './util/auth';

function addDiagnosticRecordAndLog(
  store: Store,
  record: Omit<DiagnosticRecord, 'timestamp'>,
  logger: Logger
) {
  store.addDiagnosticRecord(record);
  void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
    disposition: record.outcome === 'pass' ? 'success' : 'failure',
    message: `Diagnostic (${record.type}) completed with outcome: ${record.outcome}.`,
    type: record.type,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(
  auth: InsertedSmartCardAuthApi,
  usbDrive: UsbDrive,
  logger: Logger,
  workspace: Workspace,
  browser: Browser,
  stateMachine?: PaperHandlerStateMachine,
  paperHandler?: PaperHandlerDriverInterface
) {
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
      stateMachine?.reset();
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
      });

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });

      return ok(electionDefinition);
    },

    getPaperHandlerState(): SimpleServerStatus {
      if (!stateMachine) {
        return 'no_hardware';
      }

      return stateMachine.getSimpleStatus();
    },

    setAcceptingPaperState(input: { paperTypes: AcceptedPaperType[] }): void {
      assert(stateMachine);
      stateMachine.setAcceptingPaper(input.paperTypes);
    },

    /**
     * Sets whether the voter has completed the PAT device calibration flow after a device a connected.
     */
    setPatDeviceIsCalibrated(): void {
      assert(stateMachine, 'No state machine');

      stateMachine.setPatDeviceIsCalibrated();
    },

    async printBallot(input: PrintBallotProps): Promise<void> {
      assert(stateMachine);
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);

      const pdfData = await renderBallot({
        store,
        browser,
        ...input,
      });
      stateMachine.printBallot(pdfData);
    },

    getInterpretation(): PageInterpretation | null {
      assert(stateMachine);

      // Storing the interpretation in the db requires a somewhat complicated schema
      // and would need to be deleted at the end of the voter session anyway.
      // If we can get away with storing the interpretation in memory only in the
      // state machine we should. This simplifies the logic and reduces the risk
      // of accidentally persisting ballot selections to disk.
      const sheetInterpretation = stateMachine.getInterpretation();

      if (!sheetInterpretation) {
        return null;
      }

      // Omit image data before sending to client. It's long, gets logged, and we don't need it.
      return sheetInterpretation[0].interpretation;
    },

    confirmSessionEnd(): void {
      assert(stateMachine);

      stateMachine.confirmSessionEnd();
    },

    validateBallot(): void {
      assert(stateMachine);

      stateMachine.validateBallot();
    },

    invalidateBallot(): void {
      assert(stateMachine);

      stateMachine.invalidateBallot();
    },

    startSessionWithPreprintedBallot(): void {
      assertDefined(stateMachine).startSessionWithPreprintedBallot();
    },

    returnPreprintedBallot(): void {
      assertDefined(stateMachine).returnPreprintedBallot();
    },

    async confirmInvalidateBallot(): Promise<void> {
      assert(stateMachine);

      await logger.log(LogEventId.BallotInvalidated, 'poll_worker');

      stateMachine.confirmInvalidateBallot();
    },

    async confirmBallotBoxEmptied(): Promise<void> {
      assert(stateMachine);

      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      assert(isPollWorkerAuth(authStatus), 'Expected pollworker auth');

      workspace.store.setBallotsCastSinceLastBoxChange(0);
      stateMachine.confirmBallotBoxEmptied();

      await logger.log(LogEventId.BallotBoxEmptied, 'poll_worker');
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

    async setPollsState(input: { pollsState: PollsState }) {
      const newPollsState = input.pollsState;
      const oldPollsState = store.getPollsState();
      const numBallotsPrinted = store.getBallotsPrintedCount();

      assert(newPollsState !== 'polls_closed_initial');

      // Confirm there are no printed ballots before opening polls, in compliance
      // with VVSG 2.0 1.1.3-B, even though it should be an impossible app state.
      /* istanbul ignore next - impossible app state */
      if (
        newPollsState === 'polls_open' &&
        oldPollsState === 'polls_closed_initial'
      ) {
        if (numBallotsPrinted !== 0) {
          await logger.logAsCurrentRole(LogEventId.PollsOpened, {
            disposition: 'failure',
            message:
              'Polls can not be opened when there is current ballot data on the machine',
            numBallotsPrinted,
          });
        }
        assert(numBallotsPrinted === 0);
      }

      store.setPollsState(newPollsState);

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
          /* istanbul ignore next */
          default:
            throwIllegalValue(newPollsState);
        }
      })();

      await logger.logAsCurrentRole(logEvent, { disposition: 'success' });
    },

    async setTestMode(input: { isTestMode: boolean }) {
      const logMessage = input.isTestMode
        ? 'official to test'
        : 'test to official';
      await logger.logAsCurrentRole(LogEventId.TogglingTestMode, {
        message: `Toggling from ${logMessage} mode`,
        isTestMode: input.isTestMode,
      });
      store.setTestMode(input.isTestMode);
      store.setPollsState('polls_closed_initial');
      store.setBallotsPrintedCount(0);
      await logger.logAsCurrentRole(LogEventId.ToggledTestMode, {
        disposition: 'success',
        message: `Successfully toggled from ${logMessage} mode.`,
        isTestMode: input.isTestMode,
      });
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

    getIsPatDeviceConnected(): boolean {
      if (!stateMachine) {
        return false;
      }

      return stateMachine.isPatDeviceConnected();
    },

    getApplicationDiskSpaceSummary(): Promise<DiskSpaceSummary> {
      return workspace.getDiskSpaceSummary();
    },

    addDiagnosticRecord(input: Omit<DiagnosticRecord, 'timestamp'>): void {
      addDiagnosticRecordAndLog(store, input, logger);
    },

    getMostRecentDiagnostic(input: {
      diagnosticType: DiagnosticType;
    }): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord(input.diagnosticType) ?? null;
    },

    getIsAccessibleControllerInputDetected(): Promise<boolean> {
      return isAccessibleControllerDaemonRunning(workspace.path, logger);
    },

    saveReadinessReport(): Promise<ExportDataResult> {
      return saveReadinessReport({
        workspace,
        usbDrive,
        logger,
        stateMachine: assertDefined(stateMachine),
      });
    },

    /* istanbul ignore next */
    async generateSignedHashValidationQrCodeValue() {
      const { codeVersion, machineId } = getMachineConfig();
      const electionRecord = store.getElectionRecord();
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord,
        machineId,
        softwareVersion: codeVersion,
      });
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
        disposition: 'success',
      });
      return qrCodeValue;
    },

    getMarkScanBmdModel(): BmdModelNumber {
      return getMarkScanBmdModel();
    },

    startPaperHandlerDiagnostic(): void {
      if (!stateMachine) {
        const record: Omit<DiagnosticRecord, 'timestamp'> = {
          type: 'mark-scan-paper-handler',
          outcome: 'fail',
          message: 'Printer/Scanner failed to connect',
        };
        addDiagnosticRecordAndLog(store, record, logger);
        return;
      }

      stateMachine.startPaperHandlerDiagnostic();
    },

    ...buildMockPaperHandlerApi({ paperHandler }),
  });
}

export type Api = ReturnType<typeof buildApi>;

export type { MockPaperHandlerStatus, AcceptedPaperType };

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  logger: Logger,
  workspace: Workspace,
  usbDrive: UsbDrive,
  browser: Browser,
  stateMachine?: PaperHandlerStateMachine,
  paperHandler?: PaperHandlerDriverInterface
): Application {
  const app: Application = express();
  const api = buildApi(
    auth,
    usbDrive,
    logger,
    workspace,
    browser,
    stateMachine,
    paperHandler
  );
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express, 'mark-scan');
  return app;
}
