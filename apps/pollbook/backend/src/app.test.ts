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

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
});

vi.setConfig({
  testTimeout: 20_000,
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
    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        lastName: 'Adams',
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
    });
    expect(registerResult).toMatchObject({
      firstName: 'Helena',
      lastName: 'Eagen',
      party: 'REP',
    });

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // Check in the registered voter
    const checkInResult = await localApiClient.checkInVoter({
      voterId: registerResult.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(checkInResult.ok()).toEqual(undefined);

    const updatedVoter = await localApiClient.getVoter({
      voterId: registerResult.voterId,
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
        lastName: 'Eagen',
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

    const votersAbigail = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        lastName: 'Adams',
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

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // search for the voter again
    const votersAbigail2 = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        lastName: 'Adams',
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
        lastName: 'Bee',
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
        lastName: 'Adams',
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
      });
      expect(registerResult).toMatchObject({
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
        voterId: registerResult.voterId,
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
        voterId: registerResult.voterId,
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
        voterId: registerResult.voterId,
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
        voterId: registerResult.voterId,
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
        voterId: registerResult.voterId,
        identificationMethod: { type: 'default' },
      });
      expect(checkInResult.ok()).toEqual(undefined);

      const updatedVoter = await localApiClient.getVoter({
        voterId: registerResult.voterId,
      });
      expect(updatedVoter).toEqual({
        ...registerResult,
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
        lastName: 'Adams',
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
        lastName: 'Adams',
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
      });
      expect(registerResult).toMatchObject({
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        party: 'UND',
      });
    }

    const testSearchParams = [
      // Test puncutation and whitespace in input are ignored
      {
        firstName: 'george-washington',
        lastName: 'carver-farmer',
      },
      {
        firstName: "george'washington",
        lastName: "carver'farmer",
      },
      {
        firstName: 'mar tha',
        lastName: 'wash ington',
      },
      // Test punctuation and whitespace in db column are ignored
      {
        firstName: 'georgewashington',
        lastName: 'carverfar',
      },
      {
        firstName: 'george',
        lastName: 'washington',
      },
      {
        firstName: 'martha',
        lastName: 'washington',
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
