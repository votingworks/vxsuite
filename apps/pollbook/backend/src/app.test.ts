import { beforeEach, expect, test, vi } from 'vitest';
import { electionSimpleSinglePrecinctFixtures } from '@votingworks/fixtures';
import { assert } from 'node:console';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import {
  DEV_JURISDICTION,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { BatteryInfo } from '@votingworks/backend';
import { TEST_MACHINE_ID, withApp } from '../test/app';
import {
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
} from './pollbook_package';
import {
  Voter,
  VoterAddressChangeRequest,
  VoterMailingAddressChangeRequest,
  VoterNameChangeRequest,
  VoterRegistrationRequest,
} from './types';
import { createVoter } from '../test/test_helpers';

let mockNodeEnv: 'production' | 'test' = 'test';

const electionDefinition =
  electionSimpleSinglePrecinctFixtures.readElectionDefinition();
const electionKey = constructElectionKey(electionDefinition.election);
const townStreetNames = parseValidStreetsFromCsvString(
  electionSimpleSinglePrecinctFixtures.pollbookTownStreetNames.asText(),
  electionDefinition.election
);
const townVoters = parseVotersFromCsvString(
  electionSimpleSinglePrecinctFixtures.pollbookTownVoters.asText(),
  electionDefinition.election
);
const currentPrecinctId = electionDefinition.election.precincts[0].id;

vi.mock(
  './globals.js',
  async (importActual): Promise<typeof import('./globals')> => ({
    ...(await importActual()),
    get NODE_ENV(): 'production' | 'test' {
      return mockNodeEnv;
    },
  })
);

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

let batteryInfo: BatteryInfo | null = null;
vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  // eslint-disable-next-line @typescript-eslint/require-await
  async getBatteryInfo(): Promise<BatteryInfo | null> {
    return batteryInfo;
  },
}));

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
  batteryInfo = null;
});

vi.setConfig({
  testTimeout: 20_000,
});

test('getDeviceStatuses()', async () => {
  await withApp(
    async ({ localApiClient, workspace, mockUsbDrive, mockPrinterHandler }) => {
      workspace.store.setElectionAndVoters(
        electionDefinition,
        'mock-package-hash',
        townStreetNames,
        townVoters
      );
      mockUsbDrive.usbDrive.status
        .expectRepeatedCallsWith()
        .resolves({ status: 'no_drive' });
      const result = await localApiClient.getDeviceStatuses();
      expect(result).toMatchObject({
        usbDrive: { status: 'no_drive' },
        printer: { connected: false },
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });

      mockUsbDrive.insertUsbDrive({});
      mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
      batteryInfo = { level: 52, discharging: true };

      const result2 = await localApiClient.getDeviceStatuses();
      expect(result2).toMatchObject({
        usbDrive: { status: 'mounted' },
        printer: { connected: true },
        battery: { discharging: true, level: 52 },
        network: {
          isOnline: false,
          pollbooks: [],
        },
      });
    }
  );
});

test('check in a voter', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);
    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    expect((votersAbigail as Voter[]).length).toEqual(3);
    const firstVoter = (votersAbigail as Voter[])[0];
    const secondVoter = (votersAbigail as Voter[])[1];

    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'UND',
    });
    expect(checkInResult.ok()).toEqual(undefined);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(true);

    const updatedFirstVoter = await localApiClient.getVoter({
      voterId: firstVoter.voterId,
    });
    expect(updatedFirstVoter.checkIn).toEqual({
      identificationMethod: { type: 'default' },
      isAbsentee: false,
      timestamp: expect.any(String),
      machineId: TEST_MACHINE_ID,
      receiptNumber: 1,
      ballotParty: 'UND',
    });

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // Check in with out-of-state driver's license
    const checkInResultOos = await localApiClient.checkInVoter({
      voterId: secondVoter.voterId,
      identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
      ballotParty: 'UND',
    });
    expect(checkInResultOos.ok()).toEqual(undefined);

    const updatedSecondVoterOos = await localApiClient.getVoter({
      voterId: secondVoter.voterId,
    });
    expect(updatedSecondVoterOos.checkIn).toEqual({
      identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
      isAbsentee: false,
      timestamp: expect.any(String),
      machineId: TEST_MACHINE_ID,
      receiptNumber: 2,
      ballotParty: 'UND',
    });

    const receiptPdfPathOos = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPathOos).toBeDefined();
    await expect(receiptPdfPathOos).toMatchPdfSnapshot();

    // Test reprinting the receipt
    const result = await localApiClient.reprintVoterReceipt({
      voterId: secondVoter.voterId,
    });
    expect(result.ok()).toEqual(undefined);

    const receiptReprint = mockPrinterHandler.getLastPrintPath();
    expect(receiptReprint).toBeDefined();
    await expect(receiptReprint).toMatchPdfSnapshot();
  });
});

test('register a voter', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      []
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

    const registrationData: VoterRegistrationRequest = {
      firstName: 'Helena',
      lastName: 'Eagen',
      middleName: 'A',
      suffix: '',
      streetNumber: '15',
      streetName: 'MAIN ST',
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'Manchester',
      state: 'NH',
      zipCode: '03101',
      party: 'REP',
      precinct: currentPrecinctId,
    };

    const registerResult = await localApiClient.registerVoter({
      registrationData,
      overrideNameMatchWarning: false,
    });
    const registerOk = registerResult.unsafeUnwrap();
    expect(registerOk).toMatchObject({
      firstName: 'Helena',
      lastName: 'Eagen',
      party: 'REP',
    });
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(true);

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // Check in the registered voter
    const checkInResult = await localApiClient.checkInVoter({
      voterId: registerOk.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'REP',
    });
    expect(checkInResult.ok()).toEqual(undefined);

    const updatedVoter = await localApiClient.getVoter({
      voterId: registerOk.voterId,
    });
    expect(updatedVoter.checkIn).toEqual({
      identificationMethod: { type: 'default' },
      isAbsentee: false,
      timestamp: expect.any(String),
      receiptNumber: 2,
      machineId: TEST_MACHINE_ID,
      ballotParty: 'REP',
    });

    const checkInReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(checkInReceiptPdfPath).toBeDefined();
    await expect(checkInReceiptPdfPath).toMatchPdfSnapshot();

    const votersEagen = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'H',
        middleName: '',
        lastName: 'Eagen',
        suffix: '',
      },
    });
    expect(votersEagen as Voter[]).toHaveLength(1);
    const voterEagen = (votersEagen as Voter[])[0];
    expect(voterEagen).toMatchObject({
      firstName: 'Helena',
      lastName: 'Eagen',
      party: 'REP',
      checkIn: {
        identificationMethod: { type: 'default' },
        isAbsentee: false,
        timestamp: expect.any(String),
        machineId: TEST_MACHINE_ID,
      },
    });
  });
});

test('register a voter - duplicate name', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      [createVoter('original', 'Dylan', `O'Brien`, 'Darren', 'I')]
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const registrationData: VoterRegistrationRequest = {
      firstName: 'DYLAN',
      lastName: 'OBRIEN',
      middleName: 'Dar-ren',
      suffix: 'I',
      streetNumber: '15',
      streetName: 'MAIN ST',
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'Manchester',
      state: 'NH',
      zipCode: '03101',
      party: 'REP',
      precinct: currentPrecinctId,
    };

    const registerResult = await localApiClient.registerVoter({
      registrationData,
      overrideNameMatchWarning: false,
    });
    expect(registerResult.err()).toMatchObject({
      type: 'duplicate-voter',
      message: expect.anything(),
      matchingVoters: expect.arrayContaining([
        expect.objectContaining({
          voterId: 'original',
        }),
      ]),
    });

    const result2 = await localApiClient.registerVoter({
      registrationData,
      overrideNameMatchWarning: true,
    });
    const registerOk = result2.ok();
    expect(registerOk).toMatchObject({
      firstName: 'DYLAN',
      lastName: 'OBRIEN',
      middleName: 'Dar-ren',
      suffix: 'I',
    });
    expect(registerOk?.voterId).not.toEqual('original');
  });
});

test('register a voter - invalid address', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      []
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const registrationData: VoterRegistrationRequest = {
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'A',
      suffix: '',
      streetNumber: '170', // not in street names
      streetName: 'MAIN ST',
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'Manchester',
      state: 'NH',
      zipCode: '03101',
      party: 'REP',
      precinct: currentPrecinctId,
    };

    // eslint-disable-next-line no-console
    console.error = vi.fn();
    await expect(() =>
      localApiClient.registerVoter({
        registrationData,
        overrideNameMatchWarning: false,
      })
    ).rejects.toThrow('Invalid voter registration');
  });
});

test('change a voter name', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );

    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const secondVoter = (votersAbigail as Voter[])[1];
    expect(votersAbigail).toHaveLength(3);

    const nameChangeData: VoterNameChangeRequest = {
      firstName: 'Barbara',
      lastName: 'Bee',
      middleName: 'B',
      suffix: 'Jr',
    };

    const changeNameResult = await localApiClient.changeVoterName({
      voterId: secondVoter.voterId,
      nameChangeData,
    });
    expect(changeNameResult.nameChange).toEqual({
      ...nameChangeData,
      timestamp: expect.any(String),
    });
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(true);

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // search for the voter again
    const votersAbigail2 = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });
    assert(votersAbigail2 !== null);
    assert(Array.isArray(votersAbigail2));
    expect(votersAbigail2).toHaveLength(2); // the changed name voter is gone
    for (const voter of votersAbigail2 as Voter[]) {
      expect(voter.voterId).not.toEqual(secondVoter.voterId);
    }

    // search for the changed name
    const votersBarbara = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Barbara',
        middleName: '',
        lastName: 'Bee',
        suffix: '',
      },
    });
    assert(votersBarbara !== null);
    assert(Array.isArray(votersBarbara));
    expect(votersBarbara).toHaveLength(1); // the changed name voter is gone
    expect((votersBarbara as Voter[])[0].voterId).toEqual(secondVoter.voterId);
  });
});

test('change a voter mailing address', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );

    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const secondVoter = (votersAbigail as Voter[])[1];
    expect(votersAbigail).toHaveLength(3);

    const mailingAddressChangeData: VoterMailingAddressChangeRequest = {
      mailingStreetNumber: '314',
      mailingStreetName: 'Random Lane',
      mailingSuffix: 'B',
      mailingApartmentUnitNumber: 'Apt 1',
      mailingHouseFractionNumber: '',
      mailingAddressLine2: 'line 2',
      mailingAddressLine3: '',
      mailingCityTown: 'Manchester',
      mailingState: 'NH',
      mailingZip5: '03101',
      mailingZip4: '1234',
    };

    const changeNameResult = await localApiClient.changeVoterMailingAddress({
      voterId: secondVoter.voterId,
      mailingAddressChangeData,
    });
    expect(changeNameResult.mailingAddressChange).toEqual({
      ...mailingAddressChangeData,
      timestamp: expect.any(String),
    });
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(true);

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();
  });
});

test('undo a voter check-in', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const firstVoter = (votersAbigail as Voter[])[0];

    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'UND',
    });
    expect(checkInResult.isOk()).toBeTruthy();

    const undoResult = await localApiClient.undoVoterCheckIn({
      voterId: firstVoter.voterId,
      reason: 'Mistaken identity',
    });
    expect(undoResult).toBeUndefined();

    const updatedFirstVoter = await localApiClient.getVoter({
      voterId: firstVoter.voterId,
    });
    expect(updatedFirstVoter.checkIn).toBeUndefined();

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();
  });
});

test('register a voter, change name and address, and check in', async () => {
  await withApp(
    async ({
      localApiClient,
      peerApiClient,
      workspace,
      mockPrinterHandler,
    }) => {
      workspace.store.setElectionAndVoters(
        electionDefinition,
        'mock-package-hash',
        townStreetNames,
        []
      );
      mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

      const registrationData: VoterRegistrationRequest = {
        firstName: 'Harmony',
        lastName: 'Cobel',
        middleName: 'A',
        suffix: 'I',
        streetNumber: '15',
        streetName: 'MAIN ST',
        streetSuffix: 'B',
        apartmentUnitNumber: '',
        houseFractionNumber: '',
        addressLine2: 'Line2 Test',
        addressLine3: '',
        city: 'Manchester',
        state: 'NH',
        zipCode: '03101',
        party: 'DEM',
        precinct: currentPrecinctId,
      };

      const registerResult = await localApiClient.registerVoter({
        registrationData,
        overrideNameMatchWarning: false,
      });
      const registerOk = registerResult.unsafeUnwrap();
      expect(registerOk).toMatchObject({
        firstName: 'Harmony',
        lastName: 'Cobel',
        party: 'DEM',
      });
      const registerReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
      expect(registerReceiptPdfPath).toBeDefined();
      await expect(registerReceiptPdfPath).toMatchPdfSnapshot();

      const nameChangeData: VoterNameChangeRequest = {
        firstName: 'John',
        lastName: 'Smith',
        middleName: '',
        suffix: '',
      };

      const nameChangeResult = await localApiClient.changeVoterName({
        voterId: registerOk.voterId,
        nameChangeData,
      });
      expect(nameChangeResult.nameChange).toEqual({
        ...nameChangeData,
        timestamp: expect.any(String),
      });
      const nameChangeReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
      expect(nameChangeReceiptPdfPath).toBeDefined();
      await expect(nameChangeReceiptPdfPath).toMatchPdfSnapshot();

      // Change name again
      const nameChangeData2: VoterNameChangeRequest = {
        firstName: 'Harmonie',
        lastName: 'Kobell',
        middleName: 'A',
        suffix: 'II',
      };

      const nameChangeResult2 = await localApiClient.changeVoterName({
        voterId: registerOk.voterId,
        nameChangeData: nameChangeData2,
      });
      expect(nameChangeResult2.nameChange).toEqual({
        ...nameChangeData2,
        timestamp: expect.any(String),
      });
      const nameChangeReceiptPdfPath2 = mockPrinterHandler.getLastPrintPath();
      expect(nameChangeReceiptPdfPath2).toBeDefined();
      await expect(nameChangeReceiptPdfPath2).toMatchPdfSnapshot();

      const addressChangeData: VoterAddressChangeRequest = {
        streetName: 'ELM ST',
        streetNumber: '20',
        streetSuffix: '',
        apartmentUnitNumber: '',
        houseFractionNumber: '',
        addressLine2: '',
        addressLine3: '',
        city: 'Manchester',
        state: 'NH',
        zipCode: '03101',
        precinct: currentPrecinctId,
      };

      const addressChangeResult = await localApiClient.changeVoterAddress({
        voterId: registerOk.voterId,
        addressChangeData,
      });
      expect(addressChangeResult.addressChange).toEqual({
        ...addressChangeData,
        timestamp: expect.any(String),
      });
      const addressReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
      expect(addressReceiptPdfPath).toBeDefined();
      await expect(addressReceiptPdfPath).toMatchPdfSnapshot();

      // Change the address again
      const addressChangeData2: VoterAddressChangeRequest = {
        ...addressChangeData,
        streetSuffix: 'B',
        apartmentUnitNumber: '2B',
        addressLine2: 'this is a second line',
      };
      const addressChange2Result = await localApiClient.changeVoterAddress({
        voterId: registerOk.voterId,
        addressChangeData: addressChangeData2,
      });
      expect(addressChange2Result.addressChange).toEqual({
        ...addressChangeData2,
        timestamp: expect.any(String),
      });
      const addressReceiptPdfPath2 = mockPrinterHandler.getLastPrintPath();
      expect(addressReceiptPdfPath2).toBeDefined();
      await expect(addressReceiptPdfPath2).toMatchPdfSnapshot();

      // Check in the voter after changes
      const checkInResult = await localApiClient.checkInVoter({
        voterId: registerOk.voterId,
        identificationMethod: { type: 'default' },
        ballotParty: 'DEM',
      });
      expect(checkInResult.ok()).toEqual(undefined);

      const updatedVoter = await localApiClient.getVoter({
        voterId: registerOk.voterId,
      });
      expect(updatedVoter).toEqual({
        ...registerOk,
        nameChange: {
          ...nameChangeData2,
          timestamp: expect.any(String),
        },
        addressChange: {
          ...addressChangeData2,
          timestamp: expect.any(String),
        },
        checkIn: {
          identificationMethod: { type: 'default' },
          isAbsentee: false,
          timestamp: expect.any(String),
          receiptNumber: 6,
          machineId: TEST_MACHINE_ID,
          ballotParty: 'DEM',
        },
      });

      const checkInReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
      expect(checkInReceiptPdfPath).toBeDefined();
      await expect(checkInReceiptPdfPath).toMatchPdfSnapshot();

      const eventsResult = await peerApiClient.getEvents({
        lastEventSyncedPerNode: {},
      });
      expect(eventsResult.hasMore).toEqual(false);
      expect(eventsResult.events).toHaveLength(6);
    }
  );
});

test('check in, change name, undo check-in, change address, and check in again', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const result = await localApiClient.setIsAbsenteeMode({
      isAbsenteeMode: true,
    });
    expect(result).toEqual(undefined);
    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const firstVoter = (votersAbigail as Voter[])[0];

    // Initial check-in
    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'UND',
    });
    expect(checkInResult.ok()).toEqual(undefined);

    const nameChangeData: VoterNameChangeRequest = {
      firstName: 'Abby',
      lastName: 'Adams-Smith',
      middleName: 'C',
      suffix: '',
    };

    const nameChangeResult = await localApiClient.changeVoterName({
      voterId: firstVoter.voterId,
      nameChangeData,
    });
    expect(nameChangeResult.nameChange).toEqual({
      ...nameChangeData,
      timestamp: expect.any(String),
    });

    // Undo check-in
    const undoResult = await localApiClient.undoVoterCheckIn({
      voterId: firstVoter.voterId,
      reason: 'Mistaken identity',
    });
    expect(undoResult).toBeUndefined();

    const addressChangeData: VoterAddressChangeRequest = {
      streetName: 'OAK ST',
      streetNumber: '25',
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'Manchester',
      state: 'NH',
      zipCode: '03101',
      precinct: currentPrecinctId,
    };

    const addressChangeResult = await localApiClient.changeVoterAddress({
      voterId: firstVoter.voterId,
      addressChangeData,
    });
    expect(addressChangeResult.addressChange).toEqual({
      ...addressChangeData,
      timestamp: expect.any(String),
    });

    // Final check-in
    const finalCheckInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'UND',
    });
    expect(finalCheckInResult.ok()).toEqual(undefined);

    const finalUpdatedVoter = await localApiClient.getVoter({
      voterId: firstVoter.voterId,
    });
    expect(finalUpdatedVoter.checkIn).toEqual({
      identificationMethod: { type: 'default' },
      isAbsentee: true,
      timestamp: expect.any(String),
      receiptNumber: 5,
      machineId: TEST_MACHINE_ID,
      ballotParty: 'UND',
    });

    const finalReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(finalReceiptPdfPath).toBeDefined();
    await expect(finalReceiptPdfPath).toMatchPdfSnapshot();
  });
});

test('change a voter address with various formats', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const thirdVoter = (votersAbigail as Voter[])[2];

    const addressChangeDataVariants: VoterAddressChangeRequest[] = [
      {
        streetName: 'SIERRA RD',
        streetNumber: '15',
        streetSuffix: '',
        apartmentUnitNumber: '',
        houseFractionNumber: '',
        addressLine2: '',
        addressLine3: '',
        city: 'MANCHESTER',
        state: 'NH',
        zipCode: '03101',
        precinct: currentPrecinctId,
      },
      {
        streetName: 'OAK ST',
        streetNumber: '25',
        streetSuffix: 'N',
        apartmentUnitNumber: '3A',
        houseFractionNumber: '',
        addressLine2: 'Building B',
        addressLine3: '',
        city: 'MANCHESTER',
        state: 'NH',
        zipCode: '03101',
        precinct: currentPrecinctId,
      },
    ];

    for (const addressChangeData of addressChangeDataVariants) {
      const changeAddressResult = await localApiClient.changeVoterAddress({
        voterId: thirdVoter.voterId,
        addressChangeData,
      });
      expect(changeAddressResult.addressChange).toEqual({
        ...addressChangeData,
        timestamp: expect.any(String),
      });

      const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
      expect(receiptPdfPath).toBeDefined();
      await expect(receiptPdfPath).toMatchPdfSnapshot();
    }
  });
});

test('voter search ignores punctuation', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    // Register some voters with punctuation in names
    const baseNewVoter: Omit<
      VoterRegistrationRequest,
      'firstName' | 'lastName' | 'middleName'
    > = {
      suffix: '',
      streetNumber: '15',
      streetName: 'MAIN ST',
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'Manchester',
      state: 'NH',
      zipCode: '03101',
      party: 'UND',
      precinct: currentPrecinctId,
    };

    const registrationRequests: VoterRegistrationRequest[] = [
      {
        ...baseNewVoter,
        firstName: 'George Washington',
        lastName: 'Carver Farmer',
        middleName: '',
      },
      {
        ...baseNewVoter,
        firstName: "Geo'rge",
        lastName: "Washing'ton",
        middleName: '',
      },
      {
        ...baseNewVoter,
        firstName: 'Mar-tha',
        lastName: 'Washing-ton',
        middleName: '',
      },
    ];

    for (const registrationData of registrationRequests) {
      const registerResult = await localApiClient.registerVoter({
        registrationData,
        overrideNameMatchWarning: false,
      });
      expect(registerResult.ok()).toMatchObject({
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        party: 'UND',
      });
    }

    const testSearchParams = [
      // Test puncutation and whitespace in input are ignored
      {
        firstName: 'george-washington',
        middleName: '',
        lastName: 'carver-farmer',
        suffix: '',
      },
      {
        firstName: "george'washington",
        middleName: '',
        lastName: "carver'farmer",
        suffix: '',
      },
      {
        firstName: 'mar tha',
        middleName: '',
        lastName: 'wash ington',
        suffix: '',
      },
      // Test punctuation and whitespace in db column are ignored
      {
        firstName: 'georgewashington',
        middleName: '',
        lastName: 'carverfar',
        suffix: '',
      },
      {
        firstName: 'george',
        middleName: '',
        lastName: 'washington',
        suffix: '',
      },
      {
        firstName: 'martha',
        middleName: '',
        lastName: 'washington',
        suffix: '',
      },
    ];

    for (const searchParams of testSearchParams) {
      const result = await localApiClient.searchVoters({
        searchParams,
      });
      assert(result !== null);
    }
  });
});

test('programCard and unprogramCard', async () => {
  await withApp(async ({ localApiClient, auth: authApi, workspace }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      [],
      []
    );

    const auth: DippedSmartCardAuthMachineState = {
      ...DEFAULT_SYSTEM_SETTINGS['auth'],
      electionKey,
      jurisdiction: DEV_JURISDICTION,
      machineType: 'poll-book',
    };

    void (await localApiClient.programCard({
      userRole: 'system_administrator',
    }));
    expect(authApi.programCard).toHaveBeenCalledTimes(1);
    expect(authApi.programCard).toHaveBeenNthCalledWith(
      1,
      { electionKey, ...auth },
      { userRole: 'system_administrator' }
    );

    void (await localApiClient.programCard({ userRole: 'election_manager' }));
    expect(authApi.programCard).toHaveBeenCalledTimes(2);
    expect(authApi.programCard).toHaveBeenNthCalledWith(
      2,
      { electionKey, ...auth },
      { userRole: 'election_manager' }
    );

    void (await localApiClient.programCard({ userRole: 'poll_worker' }));
    expect(authApi.programCard).toHaveBeenCalledTimes(3);
    expect(authApi.programCard).toHaveBeenNthCalledWith(
      3,
      { electionKey, ...auth },
      { userRole: 'poll_worker' }
    );

    void (await localApiClient.unprogramCard());
    expect(authApi.unprogramCard).toHaveBeenCalledTimes(1);
    expect(authApi.unprogramCard).toHaveBeenNthCalledWith(1, {
      electionKey,
      ...auth,
    });
  });
});

test('mark a voter inactive', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      townVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    expect(votersAbigail).toHaveLength(3);
    const firstVoter = (votersAbigail as Voter[])[0];
    const secondVoter = (votersAbigail as Voter[])[1];
    const thirdVoter = (votersAbigail as Voter[])[2];

    // Mark the first voter as inactive
    const markInactiveResult = await localApiClient.markVoterInactive({
      voterId: firstVoter.voterId,
    });
    expect(markInactiveResult.ok()).toEqual(undefined);

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // We should now be able to check in this voter even though they are marked inactive.
    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'UND',
    });
    expect(checkInResult.ok()).toEqual(undefined);

    // Check in a different voter
    const checkIn = await localApiClient.checkInVoter({
      voterId: secondVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'UND',
    });
    expect(checkIn.ok()).toEqual(undefined);
    // Trying to mark this voter as inactive should return an error.
    const markInactiveErr = await localApiClient.markVoterInactive({
      voterId: secondVoter.voterId,
    });
    expect(markInactiveErr.err()).toEqual('voter_checked_in');

    // Changing the name before marking inactive is fine
    await localApiClient.changeVoterName({
      voterId: thirdVoter.voterId,
      nameChangeData: {
        firstName: 'Abigail',
        lastName: 'Adams',
        middleName: 'CHANGED',
        suffix: '',
      },
    });
    const nameChangeReceiptPath = mockPrinterHandler.getLastPrintPath();

    // We should still succeed marking inactive on voter3 with no printer connected.
    mockPrinterHandler.disconnectPrinter();
    const markInactiveResult2 = await localApiClient.markVoterInactive({
      voterId: thirdVoter.voterId,
    });
    expect(markInactiveResult2.ok()).toEqual(undefined);

    // The name change receipt should still be the last thing printed.
    expect(mockPrinterHandler.getLastPrintPath()).toEqual(
      nameChangeReceiptPath
    );

    // Search for the voters again to confirm their status
    const votersAbigail2 = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });
    assert(votersAbigail2 !== null);
    assert(Array.isArray(votersAbigail2));
    expect(votersAbigail2).toHaveLength(3);
    // The thirdVoter gets reordered due to the name change.
    expect((votersAbigail2 as Voter[])[0].voterId).toEqual(thirdVoter.voterId);
    expect((votersAbigail2 as Voter[])[0].isInactive).toEqual(true);
    expect((votersAbigail2 as Voter[])[0].nameChange).toBeDefined();
    expect((votersAbigail2 as Voter[])[1].voterId).toEqual(firstVoter.voterId);
    expect((votersAbigail2 as Voter[])[1].isInactive).toEqual(true);
    expect((votersAbigail2 as Voter[])[2].voterId).toEqual(secondVoter.voterId);
    expect((votersAbigail2 as Voter[])[2].isInactive).toEqual(false);
  });
});

test('voter search results prioritize voters from configured precinct', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    // Set up election with voters from different precincts
    const testVoters: Voter[] = [
      // These voters will be in a different precinct than the configured one
      {
        ...createVoter('voter-1', 'Alice', 'Johnson'),
        precinct: 'precinct-2',
      },
      {
        ...createVoter('voter-2', 'Bob', 'Johnson'),
        precinct: 'precinct-2',
      },
      // These voters will be in the configured precinct
      {
        ...createVoter('voter-3', 'Charlie', 'Johnson'),
        precinct: currentPrecinctId,
      },
      {
        ...createVoter('voter-4', 'David', 'Johnson'),
        precinct: currentPrecinctId,
      },
    ];

    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      [],
      testVoters
    );
    workspace.store.setConfiguredPrecinct(currentPrecinctId);
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    // Search for Johnson voters
    const searchResult = await localApiClient.searchVoters({
      searchParams: {
        firstName: '',
        middleName: '',
        lastName: 'Johnson',
        suffix: '',
      },
    });

    assert(searchResult !== null);
    assert(Array.isArray(searchResult));
    expect(searchResult).toHaveLength(4);

    const voterResults = searchResult as Voter[];

    // Verify that voters from the configured precinct come first
    expect(voterResults[0].precinct).toEqual(currentPrecinctId);
    expect(voterResults[0].firstName).toEqual('Charlie');
    expect(voterResults[1].precinct).toEqual(currentPrecinctId);
    expect(voterResults[1].firstName).toEqual('David');

    // Verify that voters from other precincts come after
    expect(voterResults[2].precinct).toEqual('precinct-2');
    expect(voterResults[2].firstName).toEqual('Alice');
    expect(voterResults[3].precinct).toEqual('precinct-2');
    expect(voterResults[3].firstName).toEqual('Bob');
  });
});

test('voter search results consider address changes for precinct prioritization', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    // Set up election with voters from different precincts
    const testVoters: Voter[] = [
      // This voter originally from a different precinct
      {
        ...createVoter('voter-1', 'Alice', 'Smith'),
        precinct: 'precinct-2',
      },
      // This voter originally from the configured precinct
      {
        ...createVoter('voter-2', 'Bob', 'Smith'),
        precinct: currentPrecinctId,
      },
    ];

    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      testVoters
    );
    workspace.store.setConfiguredPrecinct(currentPrecinctId);
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    // Change Alice's address to move her to the configured precinct
    const addressChangeResult = await localApiClient.changeVoterAddress({
      voterId: 'voter-1',
      addressChangeData: {
        streetNumber: '15',
        streetName: 'MAIN ST',
        streetSuffix: '',
        apartmentUnitNumber: '',
        houseFractionNumber: '',
        addressLine2: '',
        addressLine3: '',
        city: 'Manchester',
        state: 'NH',
        zipCode: '03101',
        precinct: currentPrecinctId,
      },
    });
    expect(addressChangeResult.addressChange).toBeDefined();

    // Search for Smith voters
    const searchResult = await localApiClient.searchVoters({
      searchParams: {
        firstName: '',
        middleName: '',
        lastName: 'Smith',
        suffix: '',
      },
    });

    assert(searchResult !== null);
    assert(Array.isArray(searchResult));
    expect(searchResult).toHaveLength(2);

    const voterResults = searchResult as Voter[];

    // Verify that Alice (with address change) comes first due to effective precinct
    expect(voterResults[0].firstName).toEqual('Alice');
    expect(voterResults[0].addressChange?.precinct).toEqual(currentPrecinctId);

    // Verify that Bob comes second (also in configured precinct, but alphabetically after Alice)
    expect(voterResults[1].firstName).toEqual('Bob');
    expect(voterResults[1].precinct).toEqual(currentPrecinctId);
  });
});

test('searchVoters sorts voters with matching precinct first', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    // Create test voters from different precincts
    const testVoters = [
      { ...createVoter('voter-1', 'Alice', 'Adams'), precinct: 'precinct-2' },
      {
        ...createVoter('voter-2', 'Alice', 'Brown'),
        precinct: currentPrecinctId,
      },
      {
        ...createVoter('voter-3', 'Bob', 'Adams'),
        precinct: currentPrecinctId,
      },
      { ...createVoter('voter-4', 'Charlie', 'Adams'), precinct: 'precinct-2' },
    ];

    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      testVoters
    );

    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    // Search for all Adams voters
    const votersAdams = await localApiClient.searchVoters({
      searchParams: {
        firstName: '',
        middleName: '',
        lastName: 'AdAMS',
        suffix: '',
      },
    });

    assert(votersAdams !== null);
    assert(Array.isArray(votersAdams));
    expect((votersAdams as Voter[]).length).toEqual(3);

    // Verify that voters from the configured precinct come first
    const result = votersAdams as Voter[];

    // Bob Adams (current precinct) should come first
    expect(result[0].firstName).toEqual('Bob');
    expect(result[0].lastName).toEqual('Adams');
    expect(result[0].precinct).toEqual(currentPrecinctId);

    // Then Alice Adams (precinct-2)
    expect(result[1].firstName).toEqual('Alice');
    expect(result[1].lastName).toEqual('Adams');
    expect(result[1].precinct).toEqual('precinct-2');

    // Then Charlie Adams (precinct-2)
    expect(result[2].firstName).toEqual('Charlie');
    expect(result[2].lastName).toEqual('Adams');
    expect(result[2].precinct).toEqual('precinct-2');
  });
});

test('searchVoters considers address changes for precinct matching', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    // Create test voters - Charlie starts in precinct-2
    const testVoters = [
      {
        ...createVoter('voter-1', 'Alice', 'Adams'),
        precinct: currentPrecinctId,
      },
      { ...createVoter('voter-2', 'Charlie', 'Adams'), precinct: 'precinct-2' },
    ];

    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      townStreetNames,
      testVoters
    );

    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    // Change Charlie's address to move them to current precinct
    const addressChangeResult = await localApiClient.changeVoterAddress({
      voterId: testVoters[1].voterId,
      addressChangeData: {
        streetName: 'OAK ST',
        streetNumber: '25',
        streetSuffix: '',
        apartmentUnitNumber: '',
        houseFractionNumber: '',
        addressLine2: '',
        addressLine3: '',
        city: 'Manchester',
        state: 'NH',
        zipCode: '03101',
        precinct: currentPrecinctId,
      },
    });
    expect(addressChangeResult.addressChange).toBeDefined();

    // Search for all Adams voters
    const votersAdams = await localApiClient.searchVoters({
      searchParams: {
        firstName: '',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
      },
    });

    assert(votersAdams !== null);
    assert(Array.isArray(votersAdams));
    expect((votersAdams as Voter[]).length).toEqual(2);

    const result = votersAdams as Voter[];

    // Both voters should now be in current precinct, sorted alphabetically
    // Alice Adams should come first
    expect(result[0].firstName).toEqual('Alice');
    expect(result[0].lastName).toEqual('Adams');
    expect(result[0].precinct).toEqual(currentPrecinctId);

    // Charlie Adams should come second (moved to current precinct via address change)
    expect(result[1].firstName).toEqual('Charlie');
    expect(result[1].lastName).toEqual('Adams');
    expect(result[1].addressChange?.precinct).toEqual(currentPrecinctId);
  });
});
