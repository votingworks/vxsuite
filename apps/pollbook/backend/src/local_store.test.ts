import { test, expect, vi } from 'vitest';
import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import { Election, ElectionDefinition } from '@votingworks/types';
import {
  createValidStreetInfo,
  createVoter,
  getTestElectionDefinition,
} from '../test/test_helpers';
import { LocalStore } from './local_store';
import { VoterRegistrationRequest } from './types';

test('findVotersWithName works as expected - voters without name changes', () => {
  const localStore = LocalStore.memoryStore();
  const testElectionDefinition = getTestElectionDefinition();
  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, 'MiD', 'I'),
    createVoter('11', 'Ella-', `Smith`, 'Stephanie', ''),
    createVoter('12', 'Ariel', `Farmer`, 'Cassie', 'I'),
    createVoter('13', 'Ariel', `Farmer`, 'Cassie', 'II '),
    createVoter('14', 'Ariel', `Farmer`, 'Samantha', 'II '),
    createVoter('15', 'ariel', `Farm'er`, 'Samantha', 'II'),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'fake-package-hash',
    streets,
    voters
  );
  const expectingUndefinedResult = [
    { firstName: '', lastName: '', middleName: '', suffix: '' },
    { firstName: 'Dylan', lastName: 'Dee', middleName: 'mid', suffix: 'i' },
    {
      firstName: 'Dylan',
      lastName: 'obrien',
      middleName: 'middle',
      suffix: 'i',
    },
    {
      firstName: 'Ella',
      lastName: 'Smith',
      middleName: 'Stephanie',
      suffix: 'i',
    },
    {
      firstName: 'Ariel',
      lastName: 'Farmer',
      middleName: 'Cassie',
      suffix: 'iII',
    },
  ];
  for (const testCase of expectingUndefinedResult) {
    expect(localStore.findVotersWithName(testCase)).toEqual([]);
  }
  expect(
    localStore.findVotersWithName({
      firstName: 'Dylan',
      lastName: 'obrien',
      middleName: 'mid',
      suffix: 'i',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[0].voterId }),
    ])
  );

  expect(
    localStore.findVotersWithName({
      firstName: 'dy-lan',
      lastName: 'obrien',
      middleName: 'm id',
      suffix: '-i',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[0].voterId }),
    ])
  );

  expect(
    localStore.findVotersWithName({
      firstName: 'ella',
      lastName: 'smith',
      middleName: 'stephan ie',
      suffix: ' ',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[1].voterId }),
    ])
  );

  expect(
    localStore.findVotersWithName({
      firstName: 'ariel',
      lastName: 'FARMER',
      middleName: 'CaSsie',
      suffix: 'i',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[2].voterId }),
    ])
  );

  expect(
    localStore.findVotersWithName({
      firstName: 'ariel',
      lastName: 'FARMER',
      middleName: 'CaSsie',
      suffix: 'ii',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[3].voterId }),
    ])
  );

  expect(
    localStore.findVotersWithName({
      firstName: 'ariel',
      lastName: 'FARMER',
      middleName: 'saman-tha',
      suffix: 'ii',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[4].voterId }),
      expect.objectContaining({ voterId: voters[5].voterId }),
    ])
  );
});

test('findVoterWithName works as expected - voters with name changes', () => {
  const localStore = LocalStore.memoryStore();
  const testElectionDefinition = getTestElectionDefinition();
  const voters = [
    createVoter('20', 'John', 'Doe', 'Allen', 'Sr'),
    createVoter('21', 'Jane', 'Smith', 'Marie', ''),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'fake-package-hash',
    streets,
    voters
  );

  // Before name change, should match original name
  expect(
    localStore.findVotersWithName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'Allen',
      suffix: 'Sr',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[0].voterId }),
    ])
  );

  // Should not match because middle name is excluded
  expect(
    localStore.findVotersWithName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: '',
      suffix: 'Sr',
    })
  ).toEqual([]);

  // Should not match because suffix is excluded
  expect(
    localStore.findVotersWithName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'Allen',
      suffix: '',
    })
  ).toEqual([]);

  // Change name for John Doe
  localStore.changeVoterName(voters[0].voterId, {
    firstName: 'Jonathan',
    lastName: 'Dough',
    middleName: 'A.',
    suffix: 'Jr',
  });

  // Should not match old name anymore
  expect(
    localStore.findVotersWithName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'Allen',
      suffix: 'Sr',
    })
  ).toEqual([]);

  // Should match new name
  expect(
    localStore.findVotersWithName({
      firstName: 'Jonathan',
      lastName: 'Dough',
      middleName: 'a.',
      suffix: 'Jr-',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[0].voterId }),
    ])
  );

  // Should not match Jane Smith with new name
  expect(
    localStore.findVotersWithName({
      firstName: 'Jane',
      lastName: 'Dough',
      middleName: 'Marie',
      suffix: '',
    })
  ).toEqual([]);

  // Change name for Jane Smith
  localStore.changeVoterName(voters[1].voterId, {
    firstName: 'Janet',
    lastName: 'Smythe',
    middleName: 'M.',
    suffix: '',
  });

  // Should match Janet Smythe
  expect(
    localStore.findVotersWithName({
      firstName: 'Janet',
      lastName: 'Smythe',
      middleName: 'M.',
      suffix: '',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[1].voterId }),
    ])
  );

  // Should not match Jane Smith anymore
  expect(
    localStore.findVotersWithName({
      firstName: 'Jane',
      lastName: 'Smith',
      middleName: 'Marie',
      suffix: '',
    })
  ).toEqual([]);
});

test('registerVoter and findVoterWithName integration', () => {
  const localStore = LocalStore.memoryStore();
  const testElectionDefinition = getTestElectionDefinition();
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'fake-package-hash',
    streets,
    []
  );

  // Register a new voter
  const registration: VoterRegistrationRequest = {
    firstName: 'Alice',
    lastName: 'Wonderland',
    middleName: 'L',
    suffix: 'III',
    party: 'DEM',
    streetNumber: '7',
    streetName: 'PEGASUS',
    streetSuffix: '',
    houseFractionNumber: '',
    apartmentUnitNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'Manchester',
    state: 'NH',
    zipCode: '03101',
  };
  const { voter } = localStore.registerVoter(registration);

  // Should be able to find the voter by their registered name
  expect(
    localStore.findVotersWithName({
      firstName: 'Alice',
      lastName: 'Wonderland',
      middleName: 'L',
      suffix: 'III',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voter.voterId }),
    ])
  );
});

test('setElectionAndVoters sets configuredPrecinctId only when there is one precinct', () => {
  const store = LocalStore.memoryStore('machine-1');

  // Test with a normal test election (multiple precincts)
  const testElectionDefinition = getTestElectionDefinition();
  store.setElectionAndVoters(
    testElectionDefinition,
    'fake-package-hash',
    [],
    []
  );
  let configInfo = store.getPollbookConfigurationInformation();
  expect(configInfo.configuredPrecinctId).toBeNull();

  // Test with an election with only one precinct
  const singlePrecinctElection: Election = {
    ...testElectionDefinition.election,
    precincts: [
      {
        id: 'precinct-1',
        name: 'Precinct 1',
        districtIds: [],
      },
    ],
  };
  const singlePrecinctElectionDefinition: ElectionDefinition = {
    ...testElectionDefinition,
    election: singlePrecinctElection,
  };
  store.deleteElectionAndVoters();
  store.setElectionAndVoters(
    singlePrecinctElectionDefinition,
    'fake-package-hash',
    [],
    []
  );
  configInfo = store.getPollbookConfigurationInformation();
  expect(configInfo.configuredPrecinctId).toEqual('precinct-1');
});

test('store can load data from database on restart', () => {
  const workspacePath = tmp.dirSync().name;
  const localStore = LocalStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    '0001',
    'test'
  );

  const testElectionDefinition = getTestElectionDefinition();
  const voters = [createVoter('10', 'Dylan', `O'Brien`, 'MiD', 'I')];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'fake-package-hash',
    streets,
    voters
  );
  expect(localStore.getElection()).toEqual(testElectionDefinition.election);
  expect(localStore.getStreetInfo()).toHaveLength(1);

  const reloadedStore = LocalStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    '0001',
    'test'
  );
  expect(reloadedStore.getElection()).toEqual(testElectionDefinition.election);
  expect(reloadedStore.getStreetInfo()).toHaveLength(1);
});
