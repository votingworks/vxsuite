import { test, expect, vi } from 'vitest';
import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import {
  createValidStreetInfo,
  createVoter,
  getTestElectionDefinition,
} from '../test/test_helpers';
import { LocalStore } from './local_store';
import { VoterRegistrationRequest } from './types';

test('findVoterWithName works as expected - voters without name changes', () => {
  const workspacePath = tmp.dirSync().name;
  const localStore = LocalStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    '0000'
  );
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
    expect(localStore.findVoterWithName(testCase)).toBeUndefined();
  }

  expect(
    localStore.findVoterWithName({
      firstName: 'Dylan',
      lastName: 'obrien',
      middleName: 'mid',
      suffix: 'i',
    })
  ).toMatchObject({ voterId: voters[0].voterId });

  expect(
    localStore.findVoterWithName({
      firstName: 'dy-lan',
      lastName: 'obrien',
      middleName: 'm id',
      suffix: '-i',
    })
  ).toMatchObject({ voterId: voters[0].voterId });

  expect(
    localStore.findVoterWithName({
      firstName: 'ella',
      lastName: 'smith',
      middleName: 'stephan ie',
      suffix: ' ',
    })
  ).toMatchObject({ voterId: voters[1].voterId });

  expect(
    localStore.findVoterWithName({
      firstName: 'ariel',
      lastName: 'FARMER',
      middleName: 'CaSsie',
      suffix: 'i',
    })
  ).toMatchObject({ voterId: voters[2].voterId });

  expect(
    localStore.findVoterWithName({
      firstName: 'ariel',
      lastName: 'FARMER',
      middleName: 'CaSsie',
      suffix: 'ii',
    })
  ).toMatchObject({ voterId: voters[3].voterId });

  expect(
    localStore.findVoterWithName({
      firstName: 'ariel',
      lastName: 'FARMER',
      middleName: 'saman-tha',
      suffix: 'ii',
    })
  ).toEqual(2);
});

test('findVoterWithName works as expected - voters with name changes', () => {
  const workspacePath = tmp.dirSync().name;
  const localStore = LocalStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    '0001'
  );
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
    localStore.findVoterWithName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'Allen',
      suffix: 'Sr',
    })
  ).toMatchObject({ voterId: voters[0].voterId });

  // Change name for John Doe
  localStore.changeVoterName(voters[0].voterId, {
    firstName: 'Jonathan',
    lastName: 'Dough',
    middleName: 'A.',
    suffix: 'Jr',
  });

  // Should not match old name anymore
  expect(
    localStore.findVoterWithName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'Allen',
      suffix: 'Sr',
    })
  ).toBeUndefined();

  // Should match new name
  expect(
    localStore.findVoterWithName({
      firstName: 'Jonathan',
      lastName: 'Dough',
      middleName: 'a.',
      suffix: 'Jr-',
    })
  ).toMatchObject({ voterId: voters[0].voterId });

  // Should not match Jane Smith with new name
  expect(
    localStore.findVoterWithName({
      firstName: 'Jane',
      lastName: 'Dough',
      middleName: 'Marie',
      suffix: '',
    })
  ).toBeUndefined();

  // Change name for Jane Smith
  localStore.changeVoterName(voters[1].voterId, {
    firstName: 'Janet',
    lastName: 'Smythe',
    middleName: 'M.',
    suffix: '',
  });

  // Should match Janet Smythe
  expect(
    localStore.findVoterWithName({
      firstName: 'Janet',
      lastName: 'Smythe',
      middleName: 'M.',
      suffix: '',
    })
  ).toMatchObject({ voterId: voters[1].voterId });

  // Should not match Jane Smith anymore
  expect(
    localStore.findVoterWithName({
      firstName: 'Jane',
      lastName: 'Smith',
      middleName: 'Marie',
      suffix: '',
    })
  ).toBeUndefined();
});

test('registerVoter and findVoterWithName integration', () => {
  const workspacePath = tmp.dirSync().name;
  const localStore = LocalStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    '0002'
  );
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
    localStore.findVoterWithName({
      firstName: 'Alice',
      lastName: 'Wonderland',
      middleName: 'L',
      suffix: 'III',
    })
  ).toMatchObject({ voterId: voter.voterId });
});
