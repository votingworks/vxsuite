import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { err, ok, Result } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, PrinterStatus } from '@votingworks/types';
import { DippedSmartCardAuthMachineState } from '@votingworks/auth';
import React from 'react';
import { getBatteryInfo } from '@votingworks/backend';
import {
  Workspace,
  AppContext,
  DeviceStatuses,
  Election,
  MachineInformation,
  Voter,
  VoterIdentificationMethod,
  VoterSearchParams,
  ConfigurationStatus,
  ValidStreetInfo,
  VoterRegistrationRequest,
  MachineConfig,
  PollbookEvent,
  VoterAddressChangeRequest,
  SummaryStatistics,
  ThroughputStat,
  VoterNameChangeRequest,
} from './types';
import { rootDebug } from './debug';
import {
  CheckInReceipt,
  RegistrationReceipt,
  AddressChangeReceipt,
  NameChangeReceipt,
} from './receipts';
import { pollUsbDriveForPollbookPackage } from './pollbook_package';
import {
  fetchEventsFromConnectedPollbooks,
  resetNetworkSetup,
  setupMachineNetworking,
} from './networking';
import { UndoCheckInReceipt } from './receipts/undo_check_in_receipt';
import { renderAndPrintReceipt } from './receipts/printing';

const debug = rootDebug;

function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const election = workspace.store.getElection();
  return {
    ...DEFAULT_SYSTEM_SETTINGS['auth'],
    electionKey: election && {
      id: election.id,
      date: election.date,
    },
  };
}

function buildApi(context: AppContext) {
  const { workspace, auth, usbDrive, printer, machineId, codeVersion } =
    context;
  const { store } = workspace;

  return grout.createApi({
    getMachineConfig(): MachineConfig {
      return {
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
          pollbooks: store.getPollbookServiceInfo().map((pollbook) => ({
            machineId: pollbook.machineId,
            lastSeen: pollbook.lastSeen,
            numCheckIns: pollbook.numCheckIns,
            status: pollbook.status,
          })),
        },
      };
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
    }): Promise<void> {
      const { voter, receiptNumber } = store.recordVoterCheckIn(input);
      debug('Checked in voter %s', voter.voterId);

      const receipt = React.createElement(CheckInReceipt, {
        voter,
        receiptNumber,
        machineId,
      });
      debug('Printing check-in receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt);
    },

    async undoVoterCheckIn(input: {
      voterId: string;
      reason: string;
    }): Promise<void> {
      // Copy voter before undoing check-in so we can print the receipt with check-in data
      const voter: Voter = { ...store.getVoter(input.voterId) };
      const { receiptNumber } = store.recordUndoVoterCheckIn(input);
      debug('Undid check-in for voter %s', input.voterId);
      const receipt = React.createElement(UndoCheckInReceipt, {
        voter,
        reason: input.reason,
        receiptNumber,
        machineId,
      });
      debug('Printing check-in receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt);
    },

    async changeVoterAddress(input: {
      voterId: string;
      addressChangeData: VoterAddressChangeRequest;
    }): Promise<Voter> {
      const { voter, receiptNumber } = store.changeVoterAddress(
        input.voterId,
        input.addressChangeData
      );
      const receipt = React.createElement(AddressChangeReceipt, {
        voter,
        receiptNumber,
        machineId,
      });
      debug('Printing address change receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt);
      return voter;
    },

    async changeVoterName(input: {
      voterId: string;
      nameChangeData: VoterNameChangeRequest;
    }): Promise<Voter> {
      const { voter, receiptNumber } = store.changeVoterName(
        input.voterId,
        input.nameChangeData
      );
      const receipt = React.createElement(NameChangeReceipt, {
        voter,
        receiptNumber,
        machineId,
      });
      debug('Printing name change receipt for voter %s', voter.voterId);
      await renderAndPrintReceipt(printer, receipt);
      return voter;
    },

    async registerVoter(input: {
      registrationData: VoterRegistrationRequest;
    }): Promise<Voter> {
      const { voter, receiptNumber } = store.registerVoter(
        input.registrationData
      );
      const receipt = React.createElement(RegistrationReceipt, {
        voter,
        receiptNumber,
        machineId,
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

    getMachineInformation(): MachineInformation {
      const election = store.getElection();
      return {
        machineId,
        configuredElectionId: election ? election.id : undefined,
      };
    },

    receiveEvent(input: { pollbookEvent: PollbookEvent }): boolean {
      return store.saveEvent(input.pollbookEvent);
    },

    getEvents(input: { lastEventSyncedPerNode: Record<string, number> }): {
      events: PollbookEvent[];
      hasMore: boolean;
    } {
      return store.getNewEvents(input.lastEventSyncedPerNode);
    },

    getAllVoters(): Array<{
      voterId: string;
      firstName: string;
      lastName: string;
    }> {
      return store.getAllVoters();
    },

    getSummaryStatistics(): SummaryStatistics {
      return store.getSummaryStatistics();
    },

    getThroughputStatistics(input: {
      throughputInterval: number;
    }): ThroughputStat[] {
      return store.getThroughputStatistics(input.throughputInterval);
    },

    async resetNetwork(): Promise<boolean> {
      await resetNetworkSetup(context.machineId);
      return true;
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));

  pollUsbDriveForPollbookPackage(context);

  void setupMachineNetworking(context);
  fetchEventsFromConnectedPollbooks(context);

  return app;
}
