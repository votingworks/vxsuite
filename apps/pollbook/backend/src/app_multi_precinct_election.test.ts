import { beforeEach, expect, test, vi } from 'vitest';
import { electionMultiPartyPrimaryFixtures } from '@votingworks/fixtures';
import { assert } from 'node:console';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { BatteryInfo } from '@votingworks/backend';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
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

let mockNodeEnv: 'production' | 'test' = 'test';

const electionDefinition =
  electionMultiPartyPrimaryFixtures.readElectionDefinition();
const cityStreetNames = parseValidStreetsFromCsvString(
  electionMultiPartyPrimaryFixtures.pollbookCityStreetNames.asText(),
  electionDefinition.election
);
const cityVoters = parseVotersFromCsvString(
  electionMultiPartyPrimaryFixtures.pollbookCityVoters.asText(),
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

test.skip('check in a voter', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      cityStreetNames,
      cityVoters
    );
    workspace.store.setConfiguredPrecinct(currentPrecinctId);
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
    expect((votersAbigail as Voter[]).length).toEqual(4);
    const firstVoter = (votersAbigail as Voter[])[0];
    const secondVoter = (votersAbigail as Voter[])[1];

    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'DEM',
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
      ballotParty: 'DEM',
    });

    const receiptPdfPath = mockPrinterHandler.getLastPrintPath();
    expect(receiptPdfPath).toBeDefined();
    await expect(receiptPdfPath).toMatchPdfSnapshot();

    // Check in with out-of-state driver's license
    const checkInResultOos = await localApiClient.checkInVoter({
      voterId: secondVoter.voterId,
      identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
      ballotParty: 'DEM',
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
      ballotParty: 'DEM',
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
      cityStreetNames,
      []
    );
    workspace.store.setConfiguredPrecinct(currentPrecinctId);
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

    const registrationData: VoterRegistrationRequest = {
      firstName: 'Helena',
      lastName: 'Eagen',
      middleName: 'A',
      suffix: '',
      streetNumber: '17',
      streetName: 'MAPLE AVE',
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
        ballotParty: 'REP',
      },
    });
  });
});

test('change a voter name', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      cityStreetNames,
      cityVoters
    );
    workspace.store.setConfiguredPrecinct(currentPrecinctId);

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
    expect(votersAbigail).toHaveLength(4);

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
    expect(votersAbigail2).toHaveLength(3); // the changed name voter is gone
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
    expect(votersBarbara).toHaveLength(1); // the changed name now found
    expect((votersBarbara as Voter[])[0].voterId).toEqual(secondVoter.voterId);
  });
});

test('change a voter mailing address - already has mailing address', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      cityStreetNames,
      cityVoters
    );
    workspace.store.setConfiguredPrecinct(currentPrecinctId);

    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

    // This voter has mailing address defined in the imported fixture.
    const votersEvelyn = await localApiClient.searchVoters({
      searchParams: {
        firstName: 'Evelyn',
        middleName: 'Laura',
        lastName: 'Jenkins',
        suffix: '',
      },
    });

    assert(votersEvelyn !== null);
    assert(Array.isArray(votersEvelyn));
    expect(votersEvelyn).toHaveLength(1);
    const voterEvelyn = (votersEvelyn as Voter[])[0];

    const mailingAddressChangeData: VoterMailingAddressChangeRequest = {
      mailingStreetNumber: '314',
      mailingStreetName: 'Random Lane',
      mailingSuffix: '',
      mailingApartmentUnitNumber: '',
      mailingHouseFractionNumber: '',
      mailingAddressLine2: '',
      mailingAddressLine3: '',
      mailingCityTown: 'Manchester',
      mailingState: 'NH',
      mailingZip5: '03101',
      mailingZip4: '',
    };

    const changeNameResult = await localApiClient.changeVoterMailingAddress({
      voterId: voterEvelyn.voterId,
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
      cityStreetNames,
      cityVoters
    );
    workspace.store.setConfiguredPrecinct(currentPrecinctId);
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
      ballotParty: 'REP',
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
        cityStreetNames,
        []
      );
      workspace.store.setConfiguredPrecinct(currentPrecinctId);
      mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);

      const registrationData: VoterRegistrationRequest = {
        firstName: 'Harmony',
        lastName: 'Cobel',
        middleName: 'A',
        suffix: 'I',
        streetNumber: '17',
        streetName: 'MAPLE AVE',
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
        streetName: 'CEDAR ST',
        streetNumber: '7',
        streetSuffix: '',
        apartmentUnitNumber: '',
        houseFractionNumber: '',
        addressLine2: '',
        addressLine3: '',
        city: 'Keene',
        state: 'NH',
        zipCode: '03431',
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

test('an undeclared voter cannot check in as undeclared', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      cityStreetNames,
      cityVoters
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
    expect((votersAbigail as Voter[]).length).toEqual(4);
    const firstVoter = (votersAbigail as Voter[])[0];

    const checkInResult = await localApiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'NOT_APPLICABLE',
    });
    expect(checkInResult.err()).toEqual(
      'undeclared_voter_missing_ballot_party'
    );
  });
});

test('in a primary, a declared voter must check in with a party selection matching the declared party', async () => {
  await withApp(async ({ localApiClient, workspace, mockPrinterHandler }) => {
    workspace.store.setElectionAndVoters(
      electionDefinition,
      'mock-package-hash',
      cityStreetNames,
      cityVoters
    );
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    expect(await localApiClient.haveElectionEventsOccurred()).toEqual(false);

    workspace.store.setConfiguredPrecinct(currentPrecinctId);

    const registrationData: VoterRegistrationRequest = {
      firstName: 'Helena',
      lastName: 'Eagen',
      middleName: 'A',
      suffix: '',
      streetNumber: '17',
      streetName: 'MAPLE AVE',
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

    await suppressingConsoleOutput(() =>
      expect(
        localApiClient.checkInVoter({
          voterId: registerOk.voterId,
          identificationMethod: { type: 'default' },
          ballotParty: 'DEM',
        })
      ).rejects.toThrow('Expected check-in party DEM to match voter party REP')
    );

    const checkInResult = await localApiClient.checkInVoter({
      voterId: registerOk.voterId,
      identificationMethod: { type: 'default' },
      ballotParty: 'REP',
    });
    expect(checkInResult.isOk()).toBeTruthy();
  });
});
