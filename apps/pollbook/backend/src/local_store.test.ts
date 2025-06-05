import { test, expect, vi } from 'vitest';
import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import {
  createValidStreetInfo,
  createVoter,
  getTestElectionDefinition,
} from '../test/test_helpers';
import { LocalStore } from './local_store';

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
    createVoter('14', 'Ariel', `Farmer`, 'Samantha', 'II'),
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
});
