import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { assertDefined, err, ok, Result } from '@votingworks/basics';
import {
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  PrinterStatus,
} from '@votingworks/types';
import { DippedSmartCardAuthMachineState } from '@votingworks/auth';
import React from 'react';
import {
  createSystemCallApi,
  Exporter,
  getBatteryInfo,
} from '@votingworks/backend';
import {
  generateFileTimeSuffix,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { stringify } from 'csv-stringify/sync';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { Logger } from '@votingworks/logging';
import {
  Workspace,
  AppContext,
  DeviceStatuses,
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
  VoterAddressChange,
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

interface BuildAppParams {
  context: AppContext;
  logger: Logger;
}

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

function buildApi({ context, logger }: BuildAppParams) {
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

      function joinNonEmpty(parts: string[]): string {
        return parts.filter((part) => part !== '').join(' ');
      }

      function voterName(name: VoterNameChangeRequest): string {
        return joinNonEmpty([
          name.firstName,
          name.middleName,
          name.lastName,
          name.suffix,
        ]);
      }

      function voterAddress(address: VoterAddressChange | Voter): string {
        if ('zipCode' in address) {
          return `${
            joinNonEmpty([
              `${address.streetNumber}${address.streetSuffix}`,
              address.streetName,
              address.apartmentUnitNumber,
            ]) + (address.addressLine2 ? `, ${address.addressLine2}` : '')
          }, ${address.city}, ${address.state} ${address.zipCode}`;
        }
        return `${
          joinNonEmpty([
            `${address.streetNumber}${address.addressSuffix}`,
            address.houseFractionNumber,
            address.streetName,
            address.apartmentUnitNumber,
          ]) + (address.addressLine2 ? `, ${address.addressLine2}` : '')
        }, ${address.postalCityTown}, ${address.state} ${address.postalZip5}`;
      }

      const voterActivity = store
        .getAllVoters()
        .filter(
          (voter) =>
            voter.checkIn ||
            voter.addressChange ||
            voter.nameChange ||
            voter.registrationEvent
        )
        .map((voter) => ({
          'Voter ID': voter.voterId,
          Party: voter.party,
          'Full Name': voterName(voter.nameChange ?? voter),
          'Full Address': voterAddress(voter.addressChange ?? voter),
          'Check-In': voter.checkIn ? 'Y' : 'N',
          Absentee: voter.checkIn?.isAbsentee ? 'Y' : 'N',
          'Address Change': voter.addressChange ? 'Y' : 'N',
          'Name Change': voter.nameChange ? 'Y' : 'N',
          'New Registration': voter.registrationEvent ? 'Y' : 'N',
          OOSDL:
            voter.checkIn?.identificationMethod.type === 'outOfStateLicense'
              ? voter.checkIn.identificationMethod.state
              : '',
        }));

      const csvContents = stringify(voterActivity, { header: true });
      const result = await exporter.exportDataToUsbDrive(
        '',
        fileName,
        csvContents
      );
      result.unsafeUnwrap();
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

    getAllVoters(): Voter[] {
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

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId,
      codeVersion,
    }),
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp({ context, logger }: BuildAppParams): Application {
  const app: Application = express();
  const api = buildApi({ context, logger });
  app.use('/api', grout.buildRouter(api, express));

  pollUsbDriveForPollbookPackage(context);

  void setupMachineNetworking(context);
  fetchEventsFromConnectedPollbooks(context);

  return app;
}
