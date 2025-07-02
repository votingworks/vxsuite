import {
  constructElectionKey,
  DippedSmartCardAuth,
  Election,
  ElectionDefinition,
} from '@votingworks/types';
import { createMockClient } from '@votingworks/grout-test-utils';
import type {
  AamvaDocument,
  Api,
  ConfigurationError,
  ConfigurationStatus,
  DeviceStatuses,
  MachineConfig,
  PollbookServiceInfo,
  ValidStreetInfo,
  Voter,
  VoterAddressChangeRequest,
  VoterCheckInError,
  VoterMailingAddressChangeRequest,
  VoterNameChangeRequest,
  VoterRegistrationRequest,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { err, ok } from '@votingworks/basics';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';

export const machineConfig: MachineConfig = {
  machineId: 'TEST-01',
  codeVersion: 'TEST-CODE-VERSION',
};

export function createMockVoter(
  voterId: string,
  firstName: string,
  lastName: string,
  precinctId: string = 'precinct-1'
): Voter {
  return {
    voterId,
    firstName,
    lastName,
    middleName: '',
    suffix: '',
    streetNumber: '123',
    addressSuffix: '',
    houseFractionNumber: '',
    streetName: 'Main St',
    state: 'NH',
    apartmentUnitNumber: '',
    addressLine2: 'line 2',
    addressLine3: '',
    postalCityTown: '',
    postalZip5: '12345',
    zip4: '6789',
    mailingStreetNumber: '',
    mailingSuffix: '',
    mailingHouseFractionNumber: '',
    mailingStreetName: '',
    mailingApartmentUnitNumber: '',
    mailingAddressLine2: '',
    mailingAddressLine3: '',
    mailingCityTown: '',
    mailingState: '',
    mailingZip5: '',
    mailingZip4: '',
    party: 'UND',
    precinct: precinctId,
    isInactive: false,
  };
}

function getDefaultExpectedVoterSearchParams(
  input: Partial<VoterSearchParams>
): VoterSearchParams {
  return {
    firstName: input.firstName || '',
    middleName: input.middleName || '',
    lastName: input.lastName || '',
    suffix: input.suffix || '',
    exactMatch: input.exactMatch || false,
  };
}

/**
 * Creates a VxPollbook specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock() {
  const mockApiClient = createMockClient<Api>();

  let currentDeviceStatus: DeviceStatuses = {
    usbDrive: mockUsbDriveStatus('no_drive'),
    barcodeScanner: { connected: false },
    printer: { connected: false },
    battery: { level: 1, discharging: false },
    network: {
      isOnline: false,
      pollbooks: [],
    },
  };

  function setAuthStatus(authStatus: DippedSmartCardAuth.AuthStatus): void {
    mockApiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
  }

  function setMachineLockedStatus(): void {
    setAuthStatus({
      status: 'logged_out',
      reason: 'machine_locked',
    });
  }

  return {
    mockApiClient,

    setAuthStatus,

    authenticateAsVendor() {
      setAuthStatus({
        status: 'logged_in',
        user: mockVendorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    authenticateAsSystemAdministrator() {
      setAuthStatus({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
        programmableCard: { status: 'ready' },
      });
    },

    authenticateAsElectionManager(election: Election) {
      setAuthStatus({
        status: 'logged_in',
        user: mockElectionManagerUser({
          electionKey: constructElectionKey(election),
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    authenticateAsPollWorker(election: Election) {
      setAuthStatus({
        status: 'logged_in',
        user: mockPollWorkerUser({
          electionKey: constructElectionKey(election),
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    lockMachine() {
      setAuthStatus({
        status: 'logged_out',
        reason: 'machine_locked',
      });
    },

    expectGetMachineInformation(): void {
      mockApiClient.getPollbookConfigurationInformation
        .expectRepeatedCallsWith()
        .resolves(machineConfig);
    },

    expectGetUsbDriveStatus(usbDriveStatus?: UsbDriveStatus): void {
      mockApiClient.getUsbDriveStatus
        .expectOptionalRepeatedCallsWith()
        .resolves(usbDriveStatus || { status: 'no_drive' });
    },

    expectHaveElectionEventsOccurred(hasEvents: boolean = false): void {
      mockApiClient.haveElectionEventsOccurred.reset();
      mockApiClient.haveElectionEventsOccurred
        .expectCallWith()
        .resolves(hasEvents);
    },

    expectGetDeviceStatuses(): void {
      mockApiClient.getDeviceStatuses
        .expectOptionalRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setUsbDriveStatus(status: UsbDriveStatus['status']): void {
      currentDeviceStatus = {
        ...currentDeviceStatus,
        usbDrive: mockUsbDriveStatus(status),
      };
      mockApiClient.getDeviceStatuses.reset();
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setPrinterStatus(connected: boolean): void {
      if (connected) {
        currentDeviceStatus = {
          ...currentDeviceStatus,
          printer: {
            connected,
            config: CITIZEN_THERMAL_PRINTER_CONFIG,
          },
        };
      } else {
        currentDeviceStatus = {
          ...currentDeviceStatus,
          printer: { connected },
        };
      }
      mockApiClient.getDeviceStatuses.reset();
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setBatteryStatus(level: number, discharging: boolean): void {
      currentDeviceStatus = {
        ...currentDeviceStatus,
        battery: { level, discharging },
      };
      mockApiClient.getDeviceStatuses.reset();
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setBarcodeScannerStatus(connected: boolean): void {
      currentDeviceStatus = {
        ...currentDeviceStatus,
        barcodeScanner: { connected },
      };
      mockApiClient.getDeviceStatuses.reset();
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setNetworkOffline(): void {
      currentDeviceStatus = {
        ...currentDeviceStatus,
        network: {
          isOnline: false,
          pollbooks: [],
        },
      };
      mockApiClient.getDeviceStatuses.reset();
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setNetworkOnline(pollbooks: PollbookServiceInfo[]): void {
      currentDeviceStatus = {
        ...currentDeviceStatus,
        network: {
          isOnline: true,
          pollbooks,
        },
      };
      mockApiClient.getDeviceStatuses.reset();
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setElection(
      electionDefinition?: ElectionDefinition,
      configuredPrecinctId?: string | null,
      pollbookPackageHash: string = 'test-package-hash'
    ) {
      mockApiClient.getElection.reset();
      mockApiClient.getPollbookConfigurationInformation.reset();
      if (!electionDefinition) {
        mockApiClient.getElection
          .expectOptionalRepeatedCallsWith()
          .resolves(err('unconfigured'));
        mockApiClient.getPollbookConfigurationInformation
          .expectOptionalRepeatedCallsWith()
          .resolves(machineConfig);
        return;
      }
      mockApiClient.getElection
        .expectOptionalRepeatedCallsWith()
        .resolves(ok(electionDefinition.election));
      mockApiClient.getPollbookConfigurationInformation
        .expectOptionalRepeatedCallsWith()
        .resolves({
          ...machineConfig,
          electionId: electionDefinition.election.id,
          electionBallotHash: electionDefinition.ballotHash,
          pollbookPackageHash,
          configuredPrecinctId: configuredPrecinctId ?? undefined,
        });
    },

    expectSetConfiguredPrecinct(configuredPrecinctId: string, error?: Error) {
      mockApiClient.setConfiguredPrecinct
        .expectCallWith({ precinctId: configuredPrecinctId })
        .resolves(error === undefined ? ok() : err(error));
      if (error === undefined) {
        mockApiClient.getPollbookConfigurationInformation.reset();
        mockApiClient.getPollbookConfigurationInformation
          .expectOptionalRepeatedCallsWith()
          .resolves({
            ...machineConfig,
            configuredPrecinctId,
          });
      }
    },

    setElectionConfiguration(status: ConfigurationStatus) {
      mockApiClient.getElection.reset();
      mockApiClient.getElection.expectRepeatedCallsWith().resolves(err(status));
    },

    setIsAbsenteeMode(isAbsenteeMode: boolean) {
      mockApiClient.getIsAbsenteeMode.expectCallWith().resolves(isAbsenteeMode);
    },

    setMachineLockedStatus,

    expectGetCheckInCounts(input: {
      thisMachine: number;
      allMachines: number;
    }) {
      mockApiClient.getCheckInCounts.expectRepeatedCallsWith().resolves({
        thisMachine: input.thisMachine,
        allMachines: input.allMachines,
      });
    },

    expectSearchVotersNull(input: Partial<VoterSearchParams>) {
      mockApiClient.searchVoters.reset();
      mockApiClient.searchVoters
        .expectRepeatedCallsWith({
          searchParams: getDefaultExpectedVoterSearchParams(input),
        })
        .resolves(null);
    },

    expectSearchVotersTooMany(
      input: Partial<VoterSearchParams>,
      excessVoters: number
    ) {
      mockApiClient.searchVoters.reset();
      mockApiClient.searchVoters
        .expectRepeatedCallsWith({
          searchParams: getDefaultExpectedVoterSearchParams(input),
        })
        .resolves(excessVoters);
    },

    expectSearchVotersWithResults(
      input: Partial<VoterSearchParams>,
      voters: Voter[]
    ) {
      mockApiClient.searchVoters.reset();
      mockApiClient.searchVoters
        .expectRepeatedCallsWith({
          searchParams: getDefaultExpectedVoterSearchParams(input),
        })
        .resolves(voters);
    },

    expectGetVoter(voter: Voter) {
      mockApiClient.getVoter.reset();
      mockApiClient.getVoter
        .expectCallWith({
          voterId: voter.voterId,
        })
        .resolves(voter);
    },

    expectCheckInVoter(voter: Voter) {
      mockApiClient.checkInVoter.reset();
      mockApiClient.checkInVoter
        .expectCallWith({
          voterId: voter.voterId,
          identificationMethod: {
            type: 'default',
          },
        })
        .resolves(ok());
    },

    expectCheckInVoterError(voter: Voter, error: VoterCheckInError) {
      mockApiClient.checkInVoter.reset();
      mockApiClient.checkInVoter
        .expectCallWith({
          voterId: voter.voterId,
          identificationMethod: {
            type: 'default',
          },
        })
        .resolves(err(error));
    },

    expectUndoVoterCheckIn(voter: Voter, reason: string) {
      mockApiClient.undoVoterCheckIn.reset();
      mockApiClient.undoVoterCheckIn
        .expectCallWith({
          voterId: voter.voterId,
          reason,
        })
        .resolves();
    },

    expectReprintReceipt(voter: Voter) {
      mockApiClient.reprintVoterReceipt.reset();
      mockApiClient.reprintVoterReceipt
        .expectCallWith({
          voterId: voter.voterId,
        })
        .resolves(ok());
    },

    expectReprintReceiptError(voter: Voter) {
      mockApiClient.reprintVoterReceipt.reset();
      mockApiClient.reprintVoterReceipt
        .expectCallWith({
          voterId: voter.voterId,
        })
        .resolves(err('not_checked_in'));
    },

    expectMarkInactive(voter: Voter) {
      mockApiClient.markVoterInactive.reset();
      mockApiClient.markVoterInactive
        .expectCallWith({
          voterId: voter.voterId,
        })
        .resolves(ok());
    },

    expectMarkInactiveError(voter: Voter) {
      mockApiClient.markVoterInactive.reset();
      mockApiClient.markVoterInactive
        .expectCallWith({
          voterId: voter.voterId,
        })
        .resolves(err('voter_checked_in'));
    },

    expectGetValidStreetInfo(streetInfo: ValidStreetInfo[]) {
      mockApiClient.getValidStreetInfo.reset();
      mockApiClient.getValidStreetInfo.expectCallWith().resolves(streetInfo);
    },

    expectRegisterVoter(
      registrationData: VoterRegistrationRequest,
      overrideNameMatchWarning: boolean,
      voter: Voter
    ) {
      mockApiClient.registerVoter.reset();
      mockApiClient.registerVoter
        .expectCallWith({ registrationData, overrideNameMatchWarning })
        .resolves(ok(voter));
    },

    expectRegisterVoterError(
      registrationData: VoterRegistrationRequest,
      overrideNameMatchWarning: boolean,
      matchingVoters: Voter[]
    ) {
      mockApiClient.registerVoter.reset();
      mockApiClient.registerVoter
        .expectCallWith({ registrationData, overrideNameMatchWarning })
        .resolves(
          err({
            type: 'duplicate-voter',
            message: 'test-error-message',
            matchingVoters,
          })
        );
    },

    // The caller is responsible for updating expectGetVoter or other API mocks
    expectChangeVoterName(input: {
      voterId: string;
      nameChangeData: VoterNameChangeRequest;
      voterToUpdate: Voter;
    }) {
      mockApiClient.changeVoterName
        .expectCallWith({
          voterId: input.voterId,
          nameChangeData: input.nameChangeData,
        })
        .resolves({ ...input.voterToUpdate, ...input.nameChangeData });
    },

    expectChangeVoterAddress(input: {
      voterId: string;
      addressChangeData: VoterAddressChangeRequest;
      voterToUpdate: Voter;
    }) {
      mockApiClient.changeVoterAddress
        .expectCallWith({
          voterId: input.voterId,
          addressChangeData: input.addressChangeData,
        })
        .resolves({ ...input.voterToUpdate, ...input.addressChangeData });
    },

    expectChangeVoterMailingAddress(input: {
      voterId: string;
      mailingAddressChangeData: VoterMailingAddressChangeRequest;
      voterToUpdate: Voter;
    }) {
      mockApiClient.changeVoterMailingAddress
        .expectCallWith({
          voterId: input.voterId,
          mailingAddressChangeData: input.mailingAddressChangeData,
        })
        .resolves({
          ...input.voterToUpdate,
          ...input.mailingAddressChangeData,
        });
    },

    /**
     * Sets an expectation that mockApiClient.unconfigure() will be called. You probably want to pair
     * this with apiMock.setElection().
     */
    expectUnconfigureElection() {
      mockApiClient.unconfigure.reset();
      mockApiClient.unconfigure.expectCallWith().resolves();
    },

    expectConfigureOverNetwork(
      machineId: string,
      configErr?: ConfigurationError
    ) {
      mockApiClient.configureFromPeerMachine.reset();
      if (configErr) {
        mockApiClient.configureFromPeerMachine
          .expectCallWith({ machineId })
          .resolves(err(configErr));
      } else {
        mockApiClient.configureFromPeerMachine
          .expectCallWith({ machineId })
          .resolves(ok());
      }
    },

    expectGetScannedIdDocument(document?: AamvaDocument) {
      mockApiClient.getScannedIdDocument
        .expectOptionalRepeatedCallsWith()
        .resolves(ok(document));
    },

    expectGetScannedIdDocumentUnknownType() {
      mockApiClient.getScannedIdDocument
        .expectOptionalRepeatedCallsWith()
        .resolves(err(new Error('unknown_document_type')));
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
