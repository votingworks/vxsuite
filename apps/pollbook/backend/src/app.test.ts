import { beforeEach, expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
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
  VoterNameChangeRequest,
  VoterRegistrationRequest,
} from './types';
import { createVoter } from '../test/test_helpers';

let mockNodeEnv: 'production' | 'test' = 'test';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const electionKey = constructElectionKey(electionDefinition.election);

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
      const testVoters = parseVotersFromCsvString(
        electionFamousNames2021Fixtures.pollbookVoters.asText()
      );
      const testStreets = parseValidStreetsFromCsvString(
        electionFamousNames2021Fixtures.pollbookStreetNames.asText()
      );
      workspace.store.setElectionAndVoters(
        electionDefinition,
        'fake-package-hash',
        testStreets,
        testVoters
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
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);
    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
        includeInactiveVoters: true,
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
    });

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // Check in with out-of-state driver's license
    const checkInResultOos = await localApiClient.checkInVoter({
      voterId: secondVoter.voterId,
      identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
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
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
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
        includeInactiveVoters: true,
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
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
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
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      []
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const registrationData: VoterRegistrationRequest = {
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'A',
      suffix: '',
      streetNumber: '150', // not in street names
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
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
    );

    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
        includeInactiveVoters: true,
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
        includeInactiveVoters: true,
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
        includeInactiveVoters: true,
      },
    });
    assert(votersBarbara !== null);
    assert(Array.isArray(votersBarbara));
    expect(votersBarbara).toHaveLength(1); // the changed name voter is gone
    expect((votersBarbara as Voter[])[0].voterId).toEqual(secondVoter.voterId);
  });
});

test('undo a voter check-in', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
        includeInactiveVoters: true,
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const firstVoter = (votersAbigail as Voter[])[0];

    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
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
      const testStreets = parseValidStreetsFromCsvString(
        electionFamousNames2021Fixtures.pollbookStreetNames.asText()
      );
      workspace.store.setElectionAndVoters(
        electionDefinition,
        'fake-package-hash',
        testStreets,
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
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
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
        includeInactiveVoters: true,
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const firstVoter = (votersAbigail as Voter[])[0];

    // Initial check-in
    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
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
    });

    const finalReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(finalReceiptPdfPath).toBeDefined();
    await expect(finalReceiptPdfPath).toMatchPdfSnapshot();
  });
});

test('change a voter address with various formats', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
        includeInactiveVoters: true,
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
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
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
        includeInactiveVoters: true,
      },
      {
        firstName: "george'washington",
        middleName: '',
        lastName: "carver'farmer",
        suffix: '',
        includeInactiveVoters: true,
      },
      {
        firstName: 'mar tha',
        middleName: '',
        lastName: 'wash ington',
        suffix: '',
        includeInactiveVoters: true,
      },
      // Test punctuation and whitespace in db column are ignored
      {
        firstName: 'georgewashington',
        middleName: '',
        lastName: 'carverfar',
        suffix: '',
        includeInactiveVoters: true,
      },
      {
        firstName: 'george',
        middleName: '',
        lastName: 'washington',
        suffix: '',
        includeInactiveVoters: true,
      },
      {
        firstName: 'martha',
        middleName: '',
        lastName: 'washington',
        suffix: '',
        includeInactiveVoters: true,
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
      'fake-package-hash',
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
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'fake-package-hash',
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
        includeInactiveVoters: true,
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

    // We should not be able to check in this voter.
    const checkInErr = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(checkInErr.err()).toEqual('voter_inactive');

    // Check in a different voter
    const checkIn = await localApiClient.checkInVoter({
      voterId: secondVoter.voterId,
      identificationMethod: { type: 'default' },
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

    // The check in receipt should still be the last thing printed.
    expect(mockPrinterHandler.getLastPrintPath()).toEqual(
      nameChangeReceiptPath
    );

    // Search for the voter again with inacative voters included
    const votersAbigail2 = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
        includeInactiveVoters: true,
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

    // Searching without inactive voters included should filter properly
    const votersAbigail3 = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        middleName: '',
        lastName: 'Adams',
        suffix: '',
        includeInactiveVoters: false,
      },
    });
    assert(votersAbigail3 !== null);
    assert(Array.isArray(votersAbigail3));
    expect(votersAbigail3).toHaveLength(1);
    expect((votersAbigail3 as Voter[])[0].isInactive).toEqual(false);
    expect((votersAbigail3 as Voter[])[0].voterId).toEqual(secondVoter.voterId);
  });
});
