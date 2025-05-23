import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { assertDefined, err, ok, Result, sleep } from '@votingworks/basics';
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
import { Logger } from '@votingworks/logging';
import {
  DeviceStatuses,
  Voter,
  VoterIdentificationMethod,
  VoterSearchParams,
  ConfigurationStatus,
  ValidStreetInfo,
  VoterRegistrationRequest,
  VoterAddressChangeRequest,
  SummaryStatistics,
  ThroughputStat,
  VoterNameChangeRequest,
  LocalAppContext,
  LocalWorkspace,
  ConfigurationError,
  MachineInformation,
} from './types';
import { rootDebug } from './debug';
import {
  CheckInReceipt,
  RegistrationReceipt,
  AddressChangeReceipt,
  NameChangeReceipt,
} from './receipts';
import { pollUsbDriveForPollbookPackage } from './pollbook_package';
import { resetNetworkSetup } from './networking';
import { UndoCheckInReceipt } from './receipts/undo_check_in_receipt';
import { renderAndPrintReceipt } from './receipts/printing';
import { UNCONFIGURE_LOCKOUT_TIMEOUT } from './globals';
import { generateVoterHistoryCsvContent } from './voter_history';

const debug = rootDebug.extend('local_app');

interface BuildAppParams {
  context: LocalAppContext;
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

function buildApi({ context, logger }: BuildAppParams) {
  const { workspace, auth, usbDrive, printer, machineId, codeVersion } =
    context;
  const { store } = workspace;

  return grout.createApi({
    getMachineInformation(): MachineInformation {
      const pollbookInformation = store.getMachineInformation();
      if (!pollbookInformation) {
        return {
          machineId,
          codeVersion,
        };
      }
      return {
        ...pollbookInformation,
        machineId,
        codeVersion,
      };
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
      const [usbDriveStatus, printerStatus, batteryStatus] = await Promise.all([
        usbDrive.status(),
        printer.status(),
        getBatteryInfo(),
      ]);
      return {
        usbDrive: usbDriveStatus,
        printer: printerStatus,
        battery: batteryStatus ?? undefined,
        network: {
          isOnline: store.getIsOnline(),
          pollbooks: store.getPollbookServiceInfo(),
        },
      };
    },

    async configureFromPeerMachine(input: {
      machineId: string;
    }): Promise<Result<void, ConfigurationError>> {
      return await workspace.peerApiClient.configureFromPeerMachine(input);
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

    searchVoters(input: {
      searchParams: VoterSearchParams;
    }): Voter[] | number | null {
      const { searchParams } = input;
      if (Object.values(searchParams).every((value) => value === '')) {
        return null;
      }

      return store.searchVoters(searchParams);
    },

    getVoter(input: { voterId: string }): Voter {
      return store.getVoter(input.voterId);
    },

    async checkInVoter(input: {
      voterId: string;
      identificationMethod: VoterIdentificationMethod;
    }): Promise<Result<void, 'already_checked_in'>> {
      const election = assertDefined(store.getElection());
      const { checkIn } = store.getVoter(input.voterId);
      if (checkIn) {
        return err('already_checked_in');
      }
      const { voter, receiptNumber } = store.recordVoterCheckIn(input);
      debug('Checked in voter %s', voter.voterId);

      const receipt = React.createElement(CheckInReceipt, {
        voter,
        machineId,
        receiptNumber,
        election,
      });
      debug('Printing check-in receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt);
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
      await renderAndPrintReceipt(printer, receipt);
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
      await renderAndPrintReceipt(printer, receipt);
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
      await renderAndPrintReceipt(printer, receipt);
      return voter;
    },

    async registerVoter(input: {
      registrationData: VoterRegistrationRequest;
    }): Promise<Voter> {
      const election = assertDefined(store.getElection());
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
      await renderAndPrintReceipt(printer, receipt);
      return voter;
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
      const exporter = new Exporter({
        allowedExportPatterns: ['**'], // TODO restrict allowed export paths
        usbDrive,
      });
      const fileName = `voter_history_${machineId}_${generateFileTimeSuffix(
        new Date()
      )}.csv`;
      const csvContents = generateVoterHistoryCsvContent(
        store.getAllVotersSorted()
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
  });
}

export type LocalApi = ReturnType<typeof buildApi>;

export function buildLocalApp({
  context,
  logger,
}: BuildAppParams): Application {
  const app: Application = express();
  const api = buildApi({ context, logger });
  app.use('/api', grout.buildRouter(api, express));

  pollUsbDriveForPollbookPackage(context);

  return app;
}
