import {
  constructElectionKey,
  DippedSmartCardAuth,
  Election,
} from '@votingworks/types';
import { createMockClient } from '@votingworks/grout-test-utils';
import type {
  Api,
  DeviceStatuses,
  MachineConfig,
  ValidStreetInfo,
  Voter,
  VoterRegistrationRequest,
} from '@votingworks/pollbook-backend';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
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
  lastName: string
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
    mailingStreetNumber: '123',
    mailingSuffix: 'APT A',
    mailingHouseFractionNumber: '',
    mailingStreetName: 'Main St',
    mailingApartmentUnitNumber: '',
    mailingAddressLine2: '',
    mailingAddressLine3: '',
    mailingCityTown: 'Somewhere',
    mailingState: 'NH',
    mailingZip5: '12345',
    mailingZip4: '6789',
    party: 'UND',
    district: 'District',
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
    printer: { connected: false },
    battery: { level: 1, discharging: false },
    network: {
      isOnline: true,
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

    /**
     * TODO: Vendor user not yet supported 
    authenticateAsVendor() {
      setAuthStatus({
        status: 'logged_in',
        user: mockVendorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    * TODO: System administrator user not yet supported
    authenticateAsSystemAdministrator() {
      setAuthStatus({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    }, 
    */

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

    expectGetMachineConfig(): void {
      mockApiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
    },

    expectGetDeviceStatuses(): void {
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setUsbDriveStatus(status: UsbDriveStatus['status']): void {
      currentDeviceStatus = {
        ...currentDeviceStatus,
        usbDrive: mockUsbDriveStatus(status),
      };
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
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setBatteryStatus(level: number, discharging: boolean): void {
      currentDeviceStatus = {
        ...currentDeviceStatus,
        battery: { level, discharging },
      };
      mockApiClient.getDeviceStatuses
        .expectRepeatedCallsWith()
        .resolves(currentDeviceStatus);
    },

    setElection(election?: Election) {
      mockApiClient.getElection.reset();
      if (!election) {
        mockApiClient.getElection
          .expectCallWith()
          .resolves(err('unconfigured'));
        return;
      }
      mockApiClient.getElection.expectCallWith().resolves(ok(election));
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

    expectSearchVotersNull(input: { firstName?: string; lastName?: string }) {
      mockApiClient.searchVoters.reset();
      mockApiClient.searchVoters
        .expectRepeatedCallsWith({
          searchParams: {
            firstName: input.firstName || '',
            lastName: input.lastName || '',
          },
        })
        .resolves(null);
    },

    expectSearchVotersTooMany(
      input: { firstName?: string; lastName?: string },
      excessVoters: number
    ) {
      mockApiClient.searchVoters.reset();
      mockApiClient.searchVoters
        .expectRepeatedCallsWith({
          searchParams: {
            firstName: input.firstName || '',
            lastName: input.lastName || '',
          },
        })
        .resolves(excessVoters);
    },

    expectSearchVotersWithResults(
      input: { firstName?: string; lastName?: string },
      voters: Voter[]
    ) {
      mockApiClient.searchVoters.reset();
      mockApiClient.searchVoters
        .expectRepeatedCallsWith({
          searchParams: {
            firstName: input.firstName || '',
            lastName: input.lastName || '',
          },
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

    expectGetValidStreetInfo(streetInfo: ValidStreetInfo[]) {
      mockApiClient.getValidStreetInfo.reset();
      mockApiClient.getValidStreetInfo.expectCallWith().resolves(streetInfo);
    },

    expectRegisterVoter(
      registrationData: VoterRegistrationRequest,
      voter: Voter
    ) {
      mockApiClient.registerVoter.reset();
      mockApiClient.registerVoter
        .expectCallWith({ registrationData })
        .resolves(voter);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
