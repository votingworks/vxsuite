import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import {
  assert,
  assertDefined,
  err,
  extractErrorMessage,
  ok,
  Optional,
  Result,
  sleep,
} from '@votingworks/basics';
import {
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  PrinterStatus,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  DEV_JURISDICTION,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import React from 'react';
import {
  createSystemCallApi,
  Exporter,
  getBatteryInfo,
} from '@votingworks/backend';
import {
  generateFileTimeSuffix,
  isElectionManagerAuth,
  isIntegrationTest,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  DeviceStatuses,
  Voter,
  VoterSearchParams,
  ConfigurationStatus,
  ValidStreetInfo,
  VoterRegistrationRequest,
  VoterAddressChangeRequest,
  VoterMailingAddressChangeRequest,
  SummaryStatistics,
  ThroughputStat,
  VoterNameChangeRequest,
  LocalAppContext,
  LocalWorkspace,
  ConfigurationError,
  VoterCheckInError,
  DuplicateVoterError,
  PollbookConfigurationInformation,
  AamvaDocument,
  isBarcodeScannerError,
  VoterIdentificationMethod,
  CheckInBallotParty,
} from './types';
import { rootDebug } from './debug';
import {
  CheckInReceipt,
  RegistrationReceipt,
  AddressChangeReceipt,
  MailingAddressChangeReceipt,
  NameChangeReceipt,
} from './receipts';
import { pollUsbDriveForPollbookPackage } from './pollbook_package';
import { resetNetworkSetup } from './networking';
import { UndoCheckInReceipt } from './receipts/undo_check_in_receipt';
import { renderAndPrintReceipt } from './receipts/printing';
import { UNCONFIGURE_LOCKOUT_TIMEOUT } from './globals';
import { generateVoterHistoryCsvContent } from './voter_history';
import { getCurrentTime } from './get_current_time';
import { MarkInactiveReceipt } from './receipts/mark_inactive_receipt';
import { BarcodeScannerClient } from './barcode_scanner/client';

const debug = rootDebug.extend('local_app');

interface BuildAppParams {
  context: LocalAppContext;
  barcodeScannerClient: BarcodeScannerClient;
  logger: Logger;
}

function constructAuthMachineState(
  workspace: LocalWorkspace
): DippedSmartCardAuthMachineState {
  const election = workspace.store.getElection();

  const jurisdiction = isIntegrationTest()
    ? TEST_JURISDICTION
    : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION;

  return {
    ...DEFAULT_SYSTEM_SETTINGS['auth'],
    electionKey: election && {
      id: election.id,
      date: election.date,
    },
    jurisdiction,
    machineType: 'poll-book',
  };
}

function buildApi({ context, logger, barcodeScannerClient }: BuildAppParams) {
  const { workspace, auth, usbDrive, printer, machineId, codeVersion } =
    context;
  const { store } = workspace;

  const middlewares: grout.Middlewares<grout.AnyContext> = {
    before: [],
    after: [
      async function logApiCall({ methodName, input }, result) {
        // The following methods are polled at frequent intervals by the frontend and silenced in logging.
        const silenceMethods = [
          'getElection',
          'getDeviceStatuses',
          'getAuthStatus',
          'getPollbookConfigurationInformation',
          'getCheckInCounts',
          'haveElectionEventsOccurred',
          'getScannedIdDocument',
          'getIsAbsenteeMode',
          'getThroughputStatistics',
          'getSummaryStatistics',
        ];
        if (silenceMethods.includes(methodName)) {
          return;
        }

        const outcome = result.isOk()
          ? { disposition: 'success' }
          : {
              disposition: 'failure',
              error: extractErrorMessage(result.err()),
            };
        // To avoid printing any sensitive information, we only log certain keys when present in the input.
        const loggableKeys = ['voterId', 'precinctId', 'isAbsenteeMode'];
        await logger.logAsCurrentRole(LogEventId.ApiCall, {
          methodName,
          ...Object.fromEntries(
            input && typeof input === 'object'
              ? loggableKeys.map((key) => [
                  key,
                  (input as Record<string, unknown>)[key],
                ])
              : []
          ),
          ...outcome,
        });
      },
    ],
  };

  const methods = {
    getPollbookConfigurationInformation(): PollbookConfigurationInformation {
      return store.getPollbookConfigurationInformation();
    },

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(workspace),
        input
      );
    },

    async formatUsbDrive(): Promise<Result<void, Error>> {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      if (!isSystemAdministratorAuth(authStatus)) {
        return err(
          new Error('Formatting USB drive requires system administrator auth.')
        );
      }

      try {
        await usbDrive.format();
        return ok();
      } catch (error) {
        return err(error as Error);
      }
    },

    async getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDrive.status();
    },

    async getDeviceStatuses(): Promise<DeviceStatuses> {
      const [
        usbDriveStatus,
        printerStatus,
        batteryStatus,
        barcodeScannerConnected,
      ] = await Promise.all([
        usbDrive.status(),
        printer.status(),
        getBatteryInfo(),
        barcodeScannerClient.isConnected(),
      ]);
      return {
        usbDrive: usbDriveStatus,
        printer: printerStatus,
        battery: batteryStatus ?? undefined,
        network: {
          isOnline: store.getIsOnline(),
          pollbooks: store.getPollbookServiceInfo(),
        },
        barcodeScanner: { connected: barcodeScannerConnected },
      };
    },

    async configureFromPeerMachine(input: {
      machineId: string;
    }): Promise<Result<void, ConfigurationError>> {
      return await workspace.peerApiClient.configureFromPeerMachine(input);
    },

    // Gets the latest scanned ID document
    getScannedIdDocument(): Result<Optional<AamvaDocument>, Error> {
      const payload = barcodeScannerClient.readPayload();
      if (isBarcodeScannerError(payload)) {
        return err(new Error(payload.error));
      }

      return ok(payload);
    },

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    getElection(): Result<Election, 'unconfigured' | ConfigurationStatus> {
      const configurationStatus = store.getConfigurationStatus();
      if (configurationStatus) {
        return err(configurationStatus);
      }
      const election = store.getElection();
      return election ? ok(election) : err('unconfigured');
    },

    haveElectionEventsOccurred(): boolean {
      return store.hasEvents();
    },

    async unconfigure(): Promise<void> {
      store.deleteElectionAndVoters();
      await usbDrive.eject();
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      // If we are an election manager, log the user out so we do not auto reconfigure
      if (isElectionManagerAuth(authStatus)) {
        workspace.store.setConfigurationStatus('recently-unconfigured');
        await sleep(UNCONFIGURE_LOCKOUT_TIMEOUT);
        auth.logOut(constructAuthMachineState(workspace));
        workspace.store.setConfigurationStatus(undefined);
      }
      await workspace.peerApiClient.unconfigure();
      pollUsbDriveForPollbookPackage(context);
    },

    getIsAbsenteeMode(): boolean {
      return store.getIsAbsenteeMode();
    },

    setIsAbsenteeMode(input: { isAbsenteeMode: boolean }): void {
      store.setIsAbsenteeMode(input.isAbsenteeMode);
    },

    setConfiguredPrecinct(input: { precinctId: string }): Result<void, Error> {
      try {
        store.setConfiguredPrecinct(input.precinctId);
        return ok();
      } catch (error) {
        assert(error instanceof Error);
        return err(error);
      }
    },

    searchVoters(input: {
      searchParams: VoterSearchParams;
    }): Voter[] | number | null {
      const { searchParams } = input;
      if (searchParams.firstName === '' && searchParams.lastName === '') {
        return null;
      }

      if (searchParams.exactMatch) {
        return store.findVotersWithName(searchParams);
      }

      return store.searchVoters(searchParams);
    },

    getVoter(input: { voterId: string }): Voter {
      return store.getVoter(input.voterId);
    },

    async checkInVoter(input: {
      voterId: string;
      identificationMethod: VoterIdentificationMethod;
      ballotParty: CheckInBallotParty;
    }): Promise<Result<void, VoterCheckInError>> {
      const election = assertDefined(store.getElection());
      const { checkIn, party: voterParty } = store.getVoter(input.voterId);
      if (checkIn) {
        return err('already_checked_in');
      }

      if (election.type === 'primary') {
        // Primary ballot party choice can't be undeclared
        switch (voterParty) {
          case 'UND':
            if (!['REP', 'DEM'].includes(input.ballotParty)) {
              return err('undeclared_voter_missing_ballot_party');
            }
            break;
          case 'REP':
          case 'DEM':
            assert(
              input.ballotParty === voterParty,
              `Expected check-in party ${input.ballotParty} to match voter party ${voterParty}`
            );
            break;
          /* istanbul ignore next - @preserve */
          default:
            return err('unknown_voter_party');
        }
      } else if (election.type === 'general') {
        assert(
          input.ballotParty === 'NOT_APPLICABLE',
          'Check-in ballot party cannot be provided during a general election'
        );
      }

      const { voter, receiptNumber } = store.recordVoterCheckIn({
        ...input,
        ballotParty: input.ballotParty,
      });
      debug('Checked in voter %s', voter.voterId);

      const receipt = React.createElement(CheckInReceipt, {
        voter,
        machineId,
        receiptNumber,
        election,
      });
      debug('Printing check-in receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
      return ok();
    },

    async undoVoterCheckIn(input: {
      voterId: string;
      reason: string;
    }): Promise<void> {
      const election = assertDefined(store.getElection());
      // Copy voter before undoing check-in so we can print the receipt with check-in data
      const voter: Voter = { ...store.getVoter(input.voterId) };
      const { receiptNumber } = store.recordUndoVoterCheckIn(input);
      debug('Undid check-in for voter %s', input.voterId);
      const receipt = React.createElement(UndoCheckInReceipt, {
        voter,
        reason: input.reason,
        machineId,
        receiptNumber,
        election,
      });
      debug('Printing check-in receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
    },

    async reprintVoterReceipt(input: {
      voterId: string;
    }): Promise<Result<void, 'not_checked_in'>> {
      const election = assertDefined(store.getElection());
      const voter: Voter = store.getVoter(input.voterId);
      if (!voter.checkIn) {
        return err('not_checked_in');
      }

      const receipt = React.createElement(CheckInReceipt, {
        voter,
        machineId,
        receiptNumber: voter.checkIn?.receiptNumber,
        election,
        reprintTimestamp: new Date(getCurrentTime()),
      });
      debug('Reprinting check-in receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
      return ok();
    },

    async changeVoterAddress(input: {
      voterId: string;
      addressChangeData: VoterAddressChangeRequest;
    }): Promise<Voter> {
      const election = assertDefined(store.getElection());
      const { voter, receiptNumber } = store.changeVoterAddress(
        input.voterId,
        input.addressChangeData
      );
      const receipt = React.createElement(AddressChangeReceipt, {
        voter,
        machineId,
        receiptNumber,
        election,
      });
      debug('Printing address change receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
      return voter;
    },

    async changeVoterMailingAddress(input: {
      voterId: string;
      mailingAddressChangeData: VoterMailingAddressChangeRequest;
    }): Promise<Voter> {
      const election = assertDefined(store.getElection());
      const { voter, receiptNumber } = store.changeVoterMailingAddress(
        input.voterId,
        input.mailingAddressChangeData
      );
      const receipt = React.createElement(MailingAddressChangeReceipt, {
        voter,
        machineId,
        receiptNumber,
        election,
      });
      debug(
        'Printing mailing address change receipt for voter %s',
        voter.voterId
      );
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
      return voter;
    },

    async changeVoterName(input: {
      voterId: string;
      nameChangeData: VoterNameChangeRequest;
    }): Promise<Voter> {
      const election = assertDefined(store.getElection());
      const { voter, receiptNumber } = store.changeVoterName(
        input.voterId,
        input.nameChangeData
      );
      const receipt = React.createElement(NameChangeReceipt, {
        voter,
        machineId,
        receiptNumber,
        election,
      });
      debug('Printing name change receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
      return voter;
    },

    async registerVoter(input: {
      registrationData: VoterRegistrationRequest;
      overrideNameMatchWarning: boolean;
    }): Promise<Result<Voter, DuplicateVoterError>> {
      const election = assertDefined(store.getElection());
      if (!input.overrideNameMatchWarning) {
        const matchingVoters = store.findVotersWithName(input.registrationData);
        if (matchingVoters.length > 0) {
          return err({
            type: 'duplicate-voter',
            message: 'Possible duplicate voter(s) detected.',
            matchingVoters,
          });
        }
      }
      const { voter, receiptNumber } = store.registerVoter(
        input.registrationData
      );
      const receipt = React.createElement(RegistrationReceipt, {
        voter,
        machineId,
        receiptNumber,
        election,
      });
      debug('Printing registration receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
      return ok(voter);
    },

    async markVoterInactive(input: {
      voterId: string;
    }): Promise<Result<void, 'voter_checked_in'>> {
      const election = assertDefined(store.getElection());
      const originalVoter: Voter = store.getVoter(input.voterId);
      if (originalVoter.checkIn) {
        return err('voter_checked_in');
      }
      const { voter, receiptNumber } = store.markVoterInactive(input.voterId);
      const printerStatus = await printer.status();
      // This flow does not require a printer to be connected, only print a receipt opportunistically.
      if (!printerStatus.connected) {
        return ok();
      }
      const receipt = React.createElement(MarkInactiveReceipt, {
        voter,
        machineId,
        receiptNumber,
        election,
      });
      debug('Printing marked inactive receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt, workspace.logger);
      return ok();
    },

    getValidStreetInfo(): ValidStreetInfo[] {
      return store.getStreetInfo();
    },

    getCheckInCounts(): { thisMachine: number; allMachines: number } {
      return {
        thisMachine: store.getCheckInCount(machineId),
        allMachines: store.getCheckInCount(),
      };
    },

    async exportVoterActivity(): Promise<void> {
      const election = assertDefined(store.getElection());
      const exporter = new Exporter({
        allowedExportPatterns: ['**'], // TODO restrict allowed export paths
        usbDrive,
      });
      const fileName = `voter_history_${machineId}_${generateFileTimeSuffix(
        new Date()
      )}.csv`;
      const csvContents = generateVoterHistoryCsvContent(
        store.getAllVotersSorted(),
        election
      );
      const result = await exporter.exportDataToUsbDrive(
        '',
        fileName,
        csvContents
      );
      result.unsafeUnwrap();
    },

    getAllVoters(): Voter[] {
      return store.getAllVotersSorted();
    },

    getSummaryStatistics(): SummaryStatistics {
      return store.getSummaryStatistics();
    },

    getThroughputStatistics(input: {
      throughputInterval: number;
    }): ThroughputStat[] {
      return store.getThroughputStatistics(input.throughputInterval);
    },

    programCard(input: {
      userRole: 'system_administrator' | 'election_manager' | 'poll_worker';
    }) {
      return auth.programCard(constructAuthMachineState(workspace), {
        userRole: input.userRole,
      });
    },

    unprogramCard() {
      return auth.unprogramCard(constructAuthMachineState(workspace));
    },

    async resetNetwork(): Promise<boolean> {
      await resetNetworkSetup(context.machineId);
      return true;
    },

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId,
      codeVersion,
    }),
  } as const;
  return grout.createApi(methods, middlewares);
}

export type LocalApi = ReturnType<typeof buildApi>;

export function buildLocalApp({
  context,
  logger,
  barcodeScannerClient,
}: BuildAppParams): Application {
  const app: Application = express();
  const api = buildApi({ context, logger, barcodeScannerClient });
  app.use('/api', grout.buildRouter(api, express));

  pollUsbDriveForPollbookPackage(context);

  return app;
}
