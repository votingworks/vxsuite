import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { err, ok, Result } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, PrinterStatus } from '@votingworks/types';
import { DippedSmartCardAuthMachineState } from '@votingworks/auth';
import { renderToPdf } from '@votingworks/printing';
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
} from './types';
import { rootDebug } from './debug';
import { CheckInReceipt } from './check_in_receipt';
import { pollUsbDriveForPollbookPackage } from './pollbook_package';
import { RegistrationReceipt } from './registration_receipt';
import { resetNetworkSetup, setupMachineNetworking } from './networking';
import { AddressChangeReceipt } from './address_change_receipt';

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
      const { voter, count } = store.recordVoterCheckIn(input);
      debug('Checked in voter %s', voter.voterId);

      const receipt = React.createElement(CheckInReceipt, {
        voter,
        count,
        machineId,
      });
      const receiptPdf = (
        await renderToPdf({
          document: receipt,
          paperDimensions: {
            width: 2.83,
            height: 7,
          },
          marginDimensions: {
            top: 0.1,
            right: 0.1,
            bottom: 0.1,
            left: 0.1,
          },
        })
      ).unsafeUnwrap();
      debug('Printing check-in receipt for voter %s', voter.voterId);
      await printer.print({ data: receiptPdf });
    },

    undoVoterCheckIn(input: { voterId: string }): void {
      store.recordUndoVoterCheckIn(input.voterId);
    },

    async changeVoterAddress(input: {
      voterId: string;
      addressChangeData: VoterAddressChangeRequest;
    }): Promise<Voter> {
      const voter = store.changeVoterAddress(
        input.voterId,
        input.addressChangeData
      );
      const receipt = React.createElement(AddressChangeReceipt, {
        voter,
        machineId,
      });
      const receiptPdf = (
        await renderToPdf({
          document: receipt,
          paperDimensions: {
            width: 2.83,
            height: 7,
          },
          marginDimensions: {
            top: 0.1,
            right: 0.1,
            bottom: 0.1,
            left: 0.1,
          },
        })
      ).unsafeUnwrap();
      debug('Printing address change receipt for voter %s', voter.voterId);
      await printer.print({ data: receiptPdf });
      return voter;
    },

    async registerVoter(input: {
      registrationData: VoterRegistrationRequest;
    }): Promise<Voter> {
      const voter = store.registerVoter(input.registrationData);
      const receipt = React.createElement(RegistrationReceipt, {
        voter,
        machineId,
      });
      const receiptPdf = (
        await renderToPdf({
          document: receipt,
          paperDimensions: {
            width: 2.83,
            height: 7,
          },
          marginDimensions: {
            top: 0.1,
            right: 0.1,
            bottom: 0.1,
            left: 0.1,
          },
        })
      ).unsafeUnwrap();
      debug('Printing registration receipt for voter %s', voter.voterId);
      await printer.print({ data: receiptPdf });
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

  return app;
}
