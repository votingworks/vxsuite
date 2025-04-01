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

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
});

vi.setConfig({
  testTimeout: 20_000,
});

test('basic end to end app test', async () => {
  await withApp(async ({ apiClient, workspace, mockPrinterHandler }) => {
    // Configuration through the polling interval on the usb drive is tested in app_config, we set up the election a bit more simply in this test.
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
    const result = await apiClient.getElection();
    mockPrinterHandler.connectPrinter(CITIZEN_THERMAL_PRINTER_CONFIG);
    // Configured for proper election
    expect(result.unsafeUnwrap().id).toEqual(
      electionFamousNames2021Fixtures.electionJson.readElection().id
    );

    const votersAdams = await apiClient.searchVoters({
      searchParams: {
        firstName: '',
        lastName: 'Adams',
      },
    });
    expect(votersAdams).toEqual(145);

    const votersAbigail = await apiClient.searchVoters({
      searchParams: {
        firstName: 'Abigail',
        lastName: 'Adams',
      },
    });

    assert(votersAbigail !== null);
    assert(Array.isArray(votersAbigail));
    expect(votersAbigail).toHaveLength(3);
    const firstVoter = (votersAbigail as Voter[])[0];
    const secondVoter = (votersAbigail as Voter[])[1];
    const thirdVoter = (votersAbigail as Voter[])[2];
    for (const voter of [firstVoter, secondVoter, thirdVoter]) {
      expect(voter.checkIn).toBeUndefined();
      expect(voter.nameChange).toBeUndefined();
      expect(voter.addressChange).toBeUndefined();
    }

    // Check in the first voter
    const checkInResult = await apiClient.checkInVoter({
      voterId: firstVoter.voterId,
      identificationMethod: { type: 'default' },
    });
    expect(checkInResult.ok()).toEqual(undefined);

    // Check that the voter is checked in
    const updatedFirstVoter = await apiClient.getVoter({
      voterId: firstVoter.voterId,
    });
    expect(updatedFirstVoter).toEqual({
      ...firstVoter,
      checkIn: {
        identificationMethod: { type: 'default' },
        isAbsentee: false,
        timestamp: expect.any(String),
        machineId: 'test',
      },
    });

    // Change the name of the second voter
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
    // Search voter Barbara Bee
    const votersBarbara = await apiClient.searchVoters({
      searchParams: {
        firstName: 'Barbara',
        lastName: 'Bee',
      },
    });
    assert(votersBarbara !== null);
    assert(Array.isArray(votersBarbara));
    expect(votersBarbara).toHaveLength(1);
    const barbaraVoter = (votersBarbara as Voter[])[0];
    expect(barbaraVoter).toEqual({
      ...secondVoter,
      nameChange: {
        ...nameChangeData,
        timestamp: expect.any(String),
      },
    });

    // Change the address of the third voter
    const addressChangeData: VoterAddressChangeRequest = {
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
    };
    // Change the address of the third voter
    const changeAddressResult = await apiClient.changeVoterAddress({
      voterId: thirdVoter.voterId,
      addressChangeData,
    });
    expect(changeAddressResult.addressChange).toEqual({
      ...addressChangeData,
      timestamp: expect.any(String),
    });
    const votersSierra = await apiClient.getVoter({
      voterId: thirdVoter.voterId,
    });
    expect(votersSierra).toEqual({
      ...thirdVoter,
      addressChange: {
        ...addressChangeData,
        timestamp: expect.any(String),
      },
    });
  });
});
