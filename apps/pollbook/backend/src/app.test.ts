import { beforeEach, expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { assert } from 'node:console';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { withApp } from '../test/app';
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
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    const votersAbigail = await apiClient.searchVoters({
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

    const checkInResult = await apiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(checkInResult.ok()).toEqual(undefined);

    const updatedFirstVoter = await apiClient.getVoter({
      voterId: firstVoter.voterId,
    });
    expect(updatedFirstVoter.checkIn).toEqual({
      identificationMethod: { type: 'default' },
      isAbsentee: false,
      timestamp: expect.any(String),
      machineId: 'test',
    });

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // Check in with out-of-state driver's license
    const checkInResultOos = await apiClient.checkInVoter({
      voterId: secondVoter.voterId,
      identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
    });
    expect(checkInResultOos.ok()).toEqual(undefined);

    const updatedSecondVoterOos = await apiClient.getVoter({
      voterId: secondVoter.voterId,
    });
    expect(updatedSecondVoterOos.checkIn).toEqual({
      identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
      isAbsentee: false,
      timestamp: expect.any(String),
      machineId: 'test',
    });

    const receiptPdfPathOos = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPathOos).toBeDefined();
    await expect(receiptPdfPathOos).toMatchPdfSnapshot();
  });
});

test('register a voter', async () => {
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
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

    const registerResult = await apiClient.registerVoter({
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
    const checkInResult = await apiClient.checkInVoter({
      voterId: registerResult.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(checkInResult.ok()).toEqual(undefined);

    const updatedVoter = await apiClient.getVoter({
      voterId: registerResult.voterId,
    });
    expect(updatedVoter.checkIn).toEqual({
      identificationMethod: { type: 'default' },
      isAbsentee: false,
      timestamp: expect.any(String),
      machineId: 'test',
    });

    const checkInReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(checkInReceiptPdfPath).toBeDefined();
    await expect(checkInReceiptPdfPath).toMatchPdfSnapshot();

    const votersEagen = await apiClient.searchVoters({
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
        machineId: 'test',
      },
    });
  });
});

test('register a voter - invalid address', async () => {
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
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
      apiClient.registerVoter({
        registrationData,
      })
    ).rejects.toThrow('Invalid voter registration');
  });
});

test('change a voter name', async () => {
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await apiClient.searchVoters({
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

    const changeNameResult = await apiClient.changeVoterName({
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
    const votersAbigail2 = await apiClient.searchVoters({
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
    const votersBarbara = await apiClient.searchVoters({
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
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await apiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        lastName: 'Adams',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const firstVoter = (votersAbigail as Voter[])[0];

    const checkInResult = await apiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(checkInResult.isOk()).toBeTruthy();

    const undoResult = await apiClient.undoVoterCheckIn({
      voterId: firstVoter.voterId,
      reason: 'Mistaken identity',
    });
    expect(undoResult).toBeUndefined();

    const updatedFirstVoter = await apiClient.getVoter({
      voterId: firstVoter.voterId,
    });
    expect(updatedFirstVoter.checkIn).toBeUndefined();

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();
  });
});

test('register a voter, change name and address, and check in', async () => {
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
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

    const registerResult = await apiClient.registerVoter({
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

    const nameChangeResult = await apiClient.changeVoterName({
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

    const nameChangeResult2 = await apiClient.changeVoterName({
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

    const addressChangeResult = await apiClient.changeVoterAddress({
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
    const addressChange2Result = await apiClient.changeVoterAddress({
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
    const checkInResult = await apiClient.checkInVoter({
      voterId: registerResult.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(checkInResult.ok()).toEqual(undefined);

    const updatedVoter = await apiClient.getVoter({
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
        machineId: 'test',
      },
    });

    const checkInReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(checkInReceiptPdfPath).toBeDefined();
    await expect(checkInReceiptPdfPath).toMatchPdfSnapshot();

    const eventsResult = await apiClient.getEvents({
      lastEventSyncedPerNode: {},
    });
    expect(eventsResult.hasMore).toEqual(false);
    expect(eventsResult.events).toHaveLength(6);
  });
});

test('check in, change name, undo check-in, change address, and check in again', async () => {
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const result = await apiClient.setIsAbsenteeMode({ isAbsenteeMode: true });
    expect(result).toEqual(undefined);
    const votersAbigail = await apiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        lastName: 'Adams',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    const firstVoter = (votersAbigail as Voter[])[0];

    // Initial check-in
    const checkInResult = await apiClient.checkInVoter({
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

    const nameChangeResult = await apiClient.changeVoterName({
      voterId: firstVoter.voterId,
      nameChangeData,
    });
    expect(nameChangeResult.nameChange).toEqual({
      ...nameChangeData,
      timestamp: expect.any(String),
    });

    // Undo check-in
    const undoResult = await apiClient.undoVoterCheckIn({
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

    const addressChangeResult = await apiClient.changeVoterAddress({
      voterId: firstVoter.voterId,
      addressChangeData,
    });
    expect(addressChangeResult.addressChange).toEqual({
      ...addressChangeData,
      timestamp: expect.any(String),
    });

    // Final check-in
    const finalCheckInResult = await apiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(finalCheckInResult.ok()).toEqual(undefined);

    const finalUpdatedVoter = await apiClient.getVoter({
      voterId: firstVoter.voterId,
    });
    expect(finalUpdatedVoter.checkIn).toEqual({
      identificationMethod: { type: 'default' },
      isAbsentee: true,
      timestamp: expect.any(String),
      machineId: 'test',
    });

    const finalReceiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(finalReceiptPdfPath).toBeDefined();
    await expect(finalReceiptPdfPath).toMatchPdfSnapshot();
  });
});

test('change a voter address with various formats', async () => {
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    const testVoters = parseVotersFromCsvString(
      electionFamousNames2021Fixtures.pollbookVoters.asText()
    );
    const testStreets = parseValidStreetsFromCsvString(
      electionFamousNames2021Fixtures.pollbookStreetNames.asText()
    );
    workspace.store.setElectionAndVoters(
      electionFamousNames2021Fixtures.electionJson.readElection(),
      testStreets,
      testVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

    const votersAbigail = await apiClient.searchVoters({
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
      const changeAddressResult = await apiClient.changeVoterAddress({
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
