import { test, expect, vi } from 'vitest';
import {
  makeTemporaryDirectory,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  Election,
  ElectionDefinition,
  Voter,
  VoterRegistrationRequest,
} from '@votingworks/types';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  createValidStreetInfo,
  createVoter,
  getTestElectionDefinition,
} from '../test/test_helpers';
import { LocalStore } from './local_store';

test('findVotersWithName works as expected - voters without name changes', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, { middleName: 'MiD', suffix: 'I' }),
    createVoter('11', 'Ella-', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
    }),
    createVoter('12', 'Ariel', `Farmer`, { middleName: 'Cassie', suffix: 'I' }),
    createVoter('13', 'Ariel', `Farmer`, {
      middleName: 'Cassie',
      suffix: 'II ',
    }),
    createVoter('14', 'Ariel', `Farmer`, {
      middleName: 'Samantha',
      suffix: 'II ',
    }),
    createVoter('15', 'ariel', `Farm'er`, {
      middleName: 'Samantha',
      suffix: 'II',
    }),
    createVoter('16', 'Mont', 'St. Michel'),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
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

  // Test period chars
  expect(
    localStore.findVotersWithName({
      firstName: 'Dy.lan',
      lastName: '.obrien',
      middleName: 'mid.',
      suffix: 'i.',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[0].voterId }),
    ])
  );

  expect(
    localStore.findVotersWithName({
      firstName: 'Mont',
      lastName: 'StMichel',
      middleName: '',
      suffix: '',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[6].voterId }),
    ])
  );
});

test('findVotersWithName middle name relaxed matching', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('100', 'John', 'Kennedy', { middleName: 'F', suffix: '' }),
    createVoter('101', 'John', 'Kennedy', {
      middleName: 'Fitzgerald',
      suffix: '',
    }),
    createVoter('102', 'John', 'Kennedy', { middleName: '', suffix: '' }),
    createVoter('103', 'John', 'Kennedy', {
      middleName: 'Salvatore',
      suffix: '',
    }),
  ];

  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  const johnF = voters[0].voterId;
  const johnFitzgerald = voters[1].voterId;
  const johnNoMiddle = voters[2].voterId;
  const johnSalvatore = voters[3].voterId;

  function expectExactMatches(
    search: {
      firstName: string;
      lastName: string;
      middleName: string;
      suffix: string;
    },
    expectedVoterIds: string[]
  ) {
    const results = localStore.findVotersWithName(search);
    const ids = results.map((v) => v.voterId).sort();
    expect(ids).toEqual([...expectedVoterIds].sort());
  }

  // Full middle name should match F initial, full match, and no middle
  // Should not match S initial
  expectExactMatches(
    {
      firstName: 'John',
      lastName: 'Kennedy',
      middleName: 'Fitzgerald',
      suffix: '',
    },
    [johnF, johnFitzgerald, johnNoMiddle]
  );

  // Middle name initial-only should match F initial, full match, and no middle
  // Should not match S initial
  expectExactMatches(
    { firstName: 'John', lastName: 'Kennedy', middleName: 'F', suffix: '' },
    [johnF, johnFitzgerald, johnNoMiddle]
  );

  // No middle name should match all
  expectExactMatches(
    { firstName: 'John', lastName: 'Kennedy', middleName: '', suffix: '' },
    [johnF, johnFitzgerald, johnNoMiddle, johnSalvatore]
  );
});

test('findVoterWithName works as expected - voters with name changes', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  const voters = [
    createVoter('20', 'John', 'Doe', { middleName: 'Allen', suffix: 'Sr' }),
    createVoter('21', 'Jane', 'Smith', { middleName: 'Marie', suffix: '' }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
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

  // Blank middle name should not constrain matching
  expect(
    localStore.findVotersWithName({
      firstName: 'John',
      lastName: 'Doe',
      middleName: '',
      suffix: 'Sr',
    })
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ voterId: voters[0].voterId }),
    ])
  );

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

test('findVotersWithName returns results sorted by configured precinct first, then by name', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  // Create voters in different precincts with similar names
  const voters = [
    // One voter in precinct-2 (non-configured) - should come second
    createVoter('30', 'John', 'Smith', {
      middleName: 'A',
      suffix: '',
      precinct: 'precinct-2',
    }),
    // One voter in precinct-1 (configured) - should come first
    createVoter('32', 'John', 'Smith', {
      middleName: 'A',
      suffix: '',
      precinct: 'precinct-1',
    }),
  ];

  const streets = [createValidStreetInfo('MAIN', 'all', 1, 100)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  // Configure precinct-1 as the active precinct
  localStore.setConfiguredPrecinct('precinct-1');

  // Find voters with exact name match
  const results = localStore.findVotersWithName({
    firstName: 'John',
    lastName: 'Smith',
    middleName: 'A',
    suffix: '',
  });

  expect(results).toHaveLength(2);

  // Verify sorting: configured precinct voters first
  expect(results[0].voterId).toEqual('32'); // John A Smith (precinct-1) - comes first
  expect(results[1].voterId).toEqual('30'); // John A Smith (precinct-2) - comes second

  // Verify the precincts are as expected
  expect(results[0].precinct).toEqual('precinct-1');
  expect(results[1].precinct).toEqual('precinct-2');
});

test('searchVoters returns results sorted by configured precinct first, then by name', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  // Create voters in different precincts with names that would sort differently alphabetically
  const voters = [
    // Voters in precinct-2 (non-configured) - these should come second
    createVoter('20', 'Alice', 'Anderson', {
      middleName: '',
      suffix: '',
      precinct: 'precinct-2',
    }),
    createVoter('21', 'Bob', 'Baker', {
      middleName: '',
      suffix: '',
      precinct: 'precinct-2',
    }),
    // Voters in precinct-1 (configured) - these should come first
    createVoter('22', 'Charlie', 'Carter', {
      middleName: '',
      suffix: '',
      precinct: 'precinct-1',
    }),
    createVoter('23', 'David', 'Davis', {
      middleName: '',
      suffix: '',
      precinct: 'precinct-1',
    }),
  ];

  const streets = [createValidStreetInfo('MAIN', 'all', 1, 100)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  // Configure precinct-1 as the active precinct
  localStore.setConfiguredPrecinct('precinct-1');

  // Search for voters with very broad criteria to get all voters
  const searchResults = localStore.searchVoters({
    lastName: '',
    firstName: '',
    middleName: '',
    suffix: '',
  });

  // Should return all 4 voters as an array (not a count)
  expect(Array.isArray(searchResults)).toEqual(true);
  const results = searchResults as Voter[];
  expect(results).toHaveLength(4);

  // Verify sorting: configured precinct voters first, then alphabetically by name
  expect(results[0].voterId).toEqual('22'); // Charlie Carter (precinct-1)
  expect(results[1].voterId).toEqual('23'); // David Davis (precinct-1)
  expect(results[2].voterId).toEqual('20'); // Alice Anderson (precinct-2)
  expect(results[3].voterId).toEqual('21'); // Bob Baker (precinct-2)

  // Verify the precincts are as expected
  expect(results[0].precinct).toEqual('precinct-1');
  expect(results[1].precinct).toEqual('precinct-1');
  expect(results[2].precinct).toEqual('precinct-2');
  expect(results[3].precinct).toEqual('precinct-2');
});

test('searchVoters ignores punctuation', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('22', 'Charlie', 'Carter', {
      middleName: '',
      suffix: '',
      precinct: 'precinct-1',
    }),
    createVoter('23', 'D av-id', "Da.v'is", {
      middleName: '',
      suffix: '',
      precinct: 'precinct-1',
    }),
  ];

  const streets = [createValidStreetInfo('MAIN', 'all', 1, 100)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  // Configure precinct-1 as the active precinct
  localStore.setConfiguredPrecinct('precinct-1');

  // Search for non-punctuated voter using various punctuation
  const punctuatedNames = ['Char.lie', 'Char-li', "Char'l"];
  for (const firstName of punctuatedNames) {
    const searchResults = localStore.searchVoters({
      lastName: '',
      firstName,
      middleName: '',
      suffix: '',
    });

    expect(Array.isArray(searchResults)).toEqual(true);
    const results = searchResults as Voter[];
    expect(results).toHaveLength(1);
    expect(results[0].voterId).toEqual('22');
  }

  // Search for punctuated voter using no punctuation
  const nonPunctuatedSearchParams = [
    {
      firstName: 'David',
    },
    { lastName: 'Davis' },
  ];
  for (const params of nonPunctuatedSearchParams) {
    const searchResults = localStore.searchVoters({
      lastName: '',
      firstName: '',
      middleName: '',
      suffix: '',
      ...params,
    });

    expect(Array.isArray(searchResults)).toEqual(true);
    const results = searchResults as Voter[];
    expect(results).toHaveLength(1);
    expect(results[0].voterId).toEqual('23');
  }
});

test('registerVoter and findVoterWithName integration', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    []
  );
  localStore.setConfiguredPrecinct('precinct-1');

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
    precinct: 'precinct-1',
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

test('registerVoter - fails when wrong precinct configured', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    []
  );
  localStore.setConfiguredPrecinct('precinct-2');

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
    precinct: 'precinct-1',
  };
  suppressingConsoleOutput(() => {
    expect(() => localStore.registerVoter(registration)).toThrow();
  });
});

test('registerVoter - fails when no precinct configured', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
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
    precinct: 'precinct-1',
  };
  suppressingConsoleOutput(() => {
    expect(() => localStore.registerVoter(registration)).toThrow();
  });
});

test('setElectionAndVoters sets configuredPrecinctId only when there is one precinct', () => {
  const store = LocalStore.memoryStore(
    mockBaseLogger({ fn: vi.fn }),
    'machine-1'
  );

  // Test with a normal test election (multiple precincts)
  const testElectionDefinition = getTestElectionDefinition();
  store.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    [],
    []
  );
  let configInfo = store.getPollbookConfigurationInformation();
  expect(configInfo.configuredPrecinctId).toBeUndefined();

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
    'mock-package-hash',
    [],
    []
  );
  configInfo = store.getPollbookConfigurationInformation();
  expect(configInfo.configuredPrecinctId).toEqual('precinct-1');
});

test('changeVoterAddress works as expected - when precinct is the properly configured one', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  const voters = [
    createVoter('20', 'John', 'Doe', { middleName: 'Allen', suffix: 'Sr' }),
  ];
  const streets = [
    createValidStreetInfo('PEGASUS', 'odd', 5, 15, '', '', 'precinct-1'),
    createValidStreetInfo('UNICORN', 'odd', 5, 15, '', '', 'precinct-2'),
  ];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );
  // Can not change address if no precinct is configured
  suppressingConsoleOutput(() => {
    expect(() =>
      localStore.changeVoterAddress(voters[0].voterId, {
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
        precinct: 'precinct-1',
      })
    ).toThrow();
  });

  localStore.setConfiguredPrecinct('precinct-1');
  const { voter } = localStore.changeVoterAddress(voters[0].voterId, {
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
    precinct: 'precinct-1',
  });
  expect(voter.addressChange).toBeDefined();

  // Changing the address to a street in the wrong precinct should throw an error
  suppressingConsoleOutput(() => {
    expect(() =>
      localStore.changeVoterAddress(voters[0].voterId, {
        streetNumber: '7',
        streetName: 'UNICORN',
        streetSuffix: '',
        houseFractionNumber: '',
        apartmentUnitNumber: '',
        addressLine2: '',
        addressLine3: '',
        city: 'Manchester',
        state: 'NH',
        zipCode: '03101',
        precinct: 'precinct-2', // Wrong precinct
      })
    ).toThrow();
  });
});

test('store can load data from database on restart', () => {
  const workspacePath = makeTemporaryDirectory();
  const localStore = LocalStore.fileStore(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    '0001',
    'test'
  );

  const testElectionDefinition = getTestElectionDefinition();
  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, { middleName: 'MiD', suffix: 'I' }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
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

test('getGeneralSummaryStatistics returns complete statistics for in-precinct voters when configured precinct is set', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  // Create voters in precinct-1 and precinct-2
  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Ella-', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('12', 'Ariel', `Farmer`, {
      middleName: 'Cassie',
      suffix: 'I',
      precinct: 'precinct-2',
      party: 'UND',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  // Register a new voter in precinct-1 (to test totalNewRegistrations)
  localStore.setConfiguredPrecinct('precinct-1');
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
    precinct: 'precinct-1',
  };
  const { voter: newVoter } = localStore.registerVoter(registration);

  // Check in some voters (to test totalCheckIns and totalAbsenteeCheckIns)
  // Regular check-in for Dylan
  localStore.recordVoterCheckIn({
    voterId: voters[0].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Absentee check-in for Ella
  localStore.setIsAbsenteeMode(true);
  localStore.recordVoterCheckIn({
    voterId: voters[1].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  // Check-in for new voter (regular)
  localStore.setIsAbsenteeMode(false);
  localStore.recordVoterCheckIn({
    voterId: newVoter.voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Test with precinct-1 configured (current state)
  const precinct1AllStats = localStore.getGeneralSummaryStatistics('ALL');
  expect(precinct1AllStats.totalVoters).toEqual(3); // Dylan, Ella, Alice in precinct-1
  expect(precinct1AllStats.totalCheckIns).toEqual(3); // All check-ins are from precinct-1 voters
  expect(precinct1AllStats.totalNewRegistrations).toEqual(1); // Alice is in precinct-1
  expect(precinct1AllStats.totalAbsenteeCheckIns).toEqual(1); // Ella's absentee check-in

  const precinct1DemStats = localStore.getGeneralSummaryStatistics('DEM');
  expect(precinct1DemStats.totalVoters).toEqual(2); // Dylan + Alice in precinct-1
  expect(precinct1DemStats.totalCheckIns).toEqual(3); // All check-ins count
  expect(precinct1DemStats.totalNewRegistrations).toEqual(1); // Alice
  expect(precinct1DemStats.totalAbsenteeCheckIns).toEqual(1); // Ella's absentee check-in

  const precinct1RepStats = localStore.getGeneralSummaryStatistics('REP');
  expect(precinct1RepStats.totalVoters).toEqual(1); // Only Ella in precinct-1
  expect(precinct1RepStats.totalCheckIns).toEqual(3); // All check-ins count
  expect(precinct1RepStats.totalNewRegistrations).toEqual(0); // No REP new registrations
  expect(precinct1RepStats.totalAbsenteeCheckIns).toEqual(1); // Ella's absentee check-in

  const precinct1UndStats = localStore.getGeneralSummaryStatistics('UND');
  expect(precinct1UndStats.totalVoters).toEqual(0); // Ariel is in precinct-2
  expect(precinct1UndStats.totalCheckIns).toEqual(3); // All check-ins count
  expect(precinct1UndStats.totalNewRegistrations).toEqual(0); // No UND new registrations
  expect(precinct1UndStats.totalAbsenteeCheckIns).toEqual(1); // Ella's absentee check-in
});

test('getGeneralSummaryStatistics returns complete statistics for all voterswhen no precinct is configured', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();
  // Create voters in precinct-1 and precinct-2
  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Ella-', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('12', 'Ariel', `Farmer`, {
      middleName: 'Cassie',
      suffix: 'I',
      precinct: 'precinct-2',
      party: 'UND',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  // No precinct configured, so we can't register voters or check them in
  // We can only test the base voter counts

  // Test ALL party filter with no precinct configured
  const allStats = localStore.getGeneralSummaryStatistics('ALL');
  expect(allStats.totalVoters).toEqual(3); // 3 original voters
  expect(allStats.totalCheckIns).toEqual(0); // No check-ins
  expect(allStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(allStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins

  // Test DEM party filter with no precinct configured
  const demStats = localStore.getGeneralSummaryStatistics('DEM');
  expect(demStats.totalVoters).toEqual(1); // Only Dylan
  expect(demStats.totalCheckIns).toEqual(0); // No check-ins
  expect(demStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(demStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins

  // Test REP party filter with no precinct configured
  const repStats = localStore.getGeneralSummaryStatistics('REP');
  expect(repStats.totalVoters).toEqual(1); // Only Ella
  expect(repStats.totalCheckIns).toEqual(0); // No check-ins
  expect(repStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(repStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins

  // Test UND party filter with no precinct configured
  const undStats = localStore.getGeneralSummaryStatistics('UND');
  expect(undStats.totalVoters).toEqual(1); // Only Ariel
  expect(undStats.totalCheckIns).toEqual(0); // No check-ins
  expect(undStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(undStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins
});

test('getGeneralSummaryStatistics throws error when called with primary election', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const primaryElectionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    primaryElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  suppressingConsoleOutput(() => {
    expect(() => localStore.getGeneralSummaryStatistics('ALL')).toThrow();
  });
});

test('getPrimarySummaryStatistics returns complete statistics for in-precinct voters when configured precinct is set', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const primaryElectionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  // Create voters in precinct-1 and precinct-2
  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Ella-', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('12', 'Ariel', `Farmer`, {
      middleName: 'Cassie',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'UND',
    }),
    createVoter('13', 'John', `Doe`, {
      middleName: 'A',
      suffix: 'Jr',
      precinct: 'precinct-2',
      party: 'DEM',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    primaryElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  // Register a new voter in precinct-1 (to test totalNewRegistrations)
  localStore.setConfiguredPrecinct('precinct-1');
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
    precinct: 'precinct-1',
  };
  const { voter: newVoter } = localStore.registerVoter(registration);

  // Check in some voters (to test totalCheckIns and totalAbsenteeCheckIns)
  // Regular DEM check-in for Dylan
  localStore.recordVoterCheckIn({
    voterId: voters[0].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Absentee REP check-in for Ella
  localStore.setIsAbsenteeMode(true);
  localStore.recordVoterCheckIn({
    voterId: voters[1].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  // Regular DEM check-in for undeclared voter Ariel
  localStore.setIsAbsenteeMode(false);
  localStore.recordVoterCheckIn({
    voterId: voters[2].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Check-in for new voter (regular DEM)
  localStore.recordVoterCheckIn({
    voterId: newVoter.voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Test with precinct-1 configured (current state)
  const precinct1AllStats = localStore.getPrimarySummaryStatistics('ALL');
  expect(precinct1AllStats.totalVoters).toEqual(4); // Dylan, Ella, Ariel, Alice in precinct-1
  expect(precinct1AllStats.totalCheckIns).toEqual(4); // All check-ins are from precinct-1 voters
  expect(precinct1AllStats.totalNewRegistrations).toEqual(1); // Alice is in precinct-1
  expect(precinct1AllStats.totalAbsenteeCheckIns).toEqual(1); // Ella's absentee check-in
  expect(precinct1AllStats.totalUndeclaredDemCheckIns).toEqual(1); // Ariel checked in with DEM ballot
  expect(precinct1AllStats.totalUndeclaredRepCheckIns).toEqual(0); // No UND voters checked in with REP ballot

  const precinct1DemStats = localStore.getPrimarySummaryStatistics('DEM');
  expect(precinct1DemStats.totalVoters).toEqual(2); // Dylan + Alice in precinct-1
  expect(precinct1DemStats.totalCheckIns).toEqual(3); // Dylan, Ariel, Alice (DEM ballot check-ins)
  expect(precinct1DemStats.totalNewRegistrations).toEqual(1); // Alice
  expect(precinct1DemStats.totalAbsenteeCheckIns).toEqual(0); // No DEM absentee check-ins
  expect(precinct1AllStats.totalUndeclaredDemCheckIns).toEqual(1); // Ariel checked in with DEM ballot
  expect(precinct1AllStats.totalUndeclaredRepCheckIns).toEqual(0); // No UND voters checked in with REP ballot

  const precinct1RepStats = localStore.getPrimarySummaryStatistics('REP');
  expect(precinct1RepStats.totalVoters).toEqual(1); // Only Ella in precinct-1
  expect(precinct1RepStats.totalCheckIns).toEqual(1); // Only Ella's REP ballot check-in
  expect(precinct1RepStats.totalNewRegistrations).toEqual(0); // No REP new registrations
  expect(precinct1RepStats.totalAbsenteeCheckIns).toEqual(1); // Ella's absentee check-in
  expect(precinct1AllStats.totalUndeclaredDemCheckIns).toEqual(1); // Ariel checked in with DEM ballot
  expect(precinct1AllStats.totalUndeclaredRepCheckIns).toEqual(0); // No UND voters checked in with REP ballot

  const precinct1UndStats = localStore.getPrimarySummaryStatistics('UND');
  expect(precinct1UndStats.totalVoters).toEqual(1); // Only Ariel in precinct-1
  expect(precinct1UndStats.totalCheckIns).toEqual(0); // UND filter counts ballot party, not voter party
  expect(precinct1UndStats.totalNewRegistrations).toEqual(0); // No UND new registrations
  expect(precinct1UndStats.totalAbsenteeCheckIns).toEqual(0); // No UND absentee check-ins
  expect(precinct1UndStats.totalUndeclaredDemCheckIns).toEqual(1); // Ariel checked in with DEM ballot
  expect(precinct1UndStats.totalUndeclaredRepCheckIns).toEqual(0); // No UND voters checked in with REP ballot
});

test('getPrimarySummaryStatistics returns complete statistics for all voters when no precinct is configured', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const primaryElectionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  // Create voters in precinct-1 and precinct-2
  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Ella-', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('12', 'Ariel', `Farmer`, {
      middleName: 'Cassie',
      suffix: 'I',
      precinct: 'precinct-2',
      party: 'UND',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    primaryElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  // No precinct configured, so we can't register voters or check them in
  // We can only test the base voter counts

  // Test ALL party filter with no precinct configured
  const allStats = localStore.getPrimarySummaryStatistics('ALL');
  expect(allStats.totalVoters).toEqual(3); // 3 original voters
  expect(allStats.totalCheckIns).toEqual(0); // No check-ins
  expect(allStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(allStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins
  expect(allStats.totalUndeclaredDemCheckIns).toEqual(0); // Only applies to UND filter
  expect(allStats.totalUndeclaredRepCheckIns).toEqual(0); // Only applies to UND filter

  // Test DEM party filter with no precinct configured
  const demStats = localStore.getPrimarySummaryStatistics('DEM');
  expect(demStats.totalVoters).toEqual(1); // Only Dylan
  expect(demStats.totalCheckIns).toEqual(0); // No check-ins
  expect(demStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(demStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins
  expect(demStats.totalUndeclaredDemCheckIns).toEqual(0); // Only applies to UND filter
  expect(demStats.totalUndeclaredRepCheckIns).toEqual(0); // Only applies to UND filter

  // Test REP party filter with no precinct configured
  const repStats = localStore.getPrimarySummaryStatistics('REP');
  expect(repStats.totalVoters).toEqual(1); // Only Ella
  expect(repStats.totalCheckIns).toEqual(0); // No check-ins
  expect(repStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(repStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins
  expect(repStats.totalUndeclaredDemCheckIns).toEqual(0); // Only applies to UND filter
  expect(repStats.totalUndeclaredRepCheckIns).toEqual(0); // Only applies to UND filter

  // Test UND party filter with no precinct configured
  const undStats = localStore.getPrimarySummaryStatistics('UND');
  expect(undStats.totalVoters).toEqual(1); // Only Ariel
  expect(undStats.totalCheckIns).toEqual(0); // No check-ins
  expect(undStats.totalNewRegistrations).toEqual(0); // No new registrations
  expect(undStats.totalAbsenteeCheckIns).toEqual(0); // No absentee check-ins
  expect(undStats.totalUndeclaredDemCheckIns).toEqual(0); // No UND voters checked in with DEM ballot
  expect(undStats.totalUndeclaredRepCheckIns).toEqual(0); // No UND voters checked in with REP ballot
});

test('getPrimarySummaryStatistics throws error when called with general election', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );

  suppressingConsoleOutput(() => {
    expect(() => localStore.getPrimarySummaryStatistics('ALL')).toThrow();
  });
});

test('getThroughputStatistics returns empty array for UND party filter', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );
  localStore.setConfiguredPrecinct('precinct-1');

  // Check in a voter
  localStore.recordVoterCheckIn({
    voterId: voters[0].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  const throughputStats = localStore.getThroughputStatistics(60, 'UND');
  expect(throughputStats).toEqual([]);
});

test('getThroughputStatistics returns empty array when no check-ins exist', () => {
  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );
  localStore.setConfiguredPrecinct('precinct-1');

  // No check-ins performed
  const throughputStats = localStore.getThroughputStatistics(60, 'ALL');
  expect(throughputStats).toEqual([]);
});

test('getThroughputStatistics returns correct throughput data for single interval', () => {
  // Use fake timers to control check-in times
  vi.useFakeTimers();

  // Set initial time to 11:00 AM
  const baseTime = new Date('2025-08-04T11:00:00.000Z');
  vi.setSystemTime(baseTime);

  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Ella', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('12', 'Ariel', `Farmer`, {
      middleName: 'Cassie',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'UND',
    }),
    createVoter('13', 'Absentee', 'Voter', {
      middleName: '',
      suffix: '',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );
  localStore.setConfiguredPrecinct('precinct-1');

  // Perform check-ins within the same hour at specific times
  // First check-in at 11:10 AM
  vi.setSystemTime(new Date('2025-08-04T11:10:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[0].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Second check-in at 11:25 AM
  vi.setSystemTime(new Date('2025-08-04T11:25:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[1].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  // Third check-in at 11:45 AM
  vi.setSystemTime(new Date('2025-08-04T11:45:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[2].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'NOT_APPLICABLE',
  });

  // Fourth check-in (absentee) at 11:46 AM
  vi.setSystemTime(new Date('2025-08-04T11:46:00.000Z'));
  localStore.setIsAbsenteeMode(true);
  localStore.recordVoterCheckIn({
    voterId: voters[3].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  localStore.setIsAbsenteeMode(false);

  // Set current time for generating statistics
  vi.setSystemTime(new Date('2025-08-04T11:50:00.000Z'));

  const throughputStats = localStore.getThroughputStatistics(60, 'ALL');
  expect(throughputStats).toHaveLength(1);
  expect(throughputStats[0]).toMatchObject({
    interval: 60,
    // 3 precinct check-ins and 1 absentee check-in, but absentee check-in shouldn't count
    checkIns: 3,
    startTime: '2025-08-04T11:00:00.000Z',
  });

  // Parse and validate the startTime is at the top of the hour
  const startTime = new Date(throughputStats[0].startTime);
  expect(startTime.getMinutes()).toEqual(0);
  expect(startTime.getSeconds()).toEqual(0);
  expect(startTime.getMilliseconds()).toEqual(0);

  // Restore real timers
  vi.useRealTimers();
});

test('getThroughputStatistics filters by party correctly', () => {
  // Use fake timers to control check-in times
  vi.useFakeTimers();

  // Set initial time to 2:00 PM
  const baseTime = new Date('2025-08-04T14:00:00.000Z');
  vi.setSystemTime(baseTime);

  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Ella', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('12', 'Ariel', `Farmer`, {
      middleName: 'Cassie',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'UND',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );
  localStore.setConfiguredPrecinct('precinct-1');

  // Check in with different ballot parties at specific times
  // DEM voter checks in at 2:05 PM
  vi.setSystemTime(new Date('2025-08-04T14:05:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[0].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // REP voter checks in at 2:15 PM
  vi.setSystemTime(new Date('2025-08-04T14:15:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[1].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  // UND voter checks in with DEM ballot at 2:25 PM
  vi.setSystemTime(new Date('2025-08-04T14:25:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[2].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM', // Undeclared voter choosing DEM ballot
  });

  // Set current time for generating statistics
  vi.setSystemTime(new Date('2025-08-04T14:30:00.000Z'));

  // Test ALL filter
  const allStats = localStore.getThroughputStatistics(60, 'ALL');
  expect(allStats).toHaveLength(1);
  expect(allStats[0].checkIns).toEqual(3);
  expect(allStats[0].startTime).toEqual('2025-08-04T14:00:00.000Z');

  // Test DEM filter
  const demStats = localStore.getThroughputStatistics(60, 'DEM');
  expect(demStats).toHaveLength(1);
  expect(demStats[0].checkIns).toEqual(2); // Dylan and Ariel with DEM ballots
  expect(demStats[0].startTime).toEqual('2025-08-04T14:00:00.000Z');

  // Test REP filter
  const repStats = localStore.getThroughputStatistics(60, 'REP');
  expect(repStats).toHaveLength(1);
  expect(repStats[0].checkIns).toEqual(1); // Only Ella with REP ballot
  expect(repStats[0].startTime).toEqual('2025-08-04T14:00:00.000Z');

  // Restore real timers
  vi.useRealTimers();
});

test('getThroughputStatistics works with different interval sizes', () => {
  // Use fake timers to control check-in times
  vi.useFakeTimers();

  // Set initial time to 9:00 AM
  const baseTime = new Date('2025-08-04T09:00:00.000Z');
  vi.setSystemTime(baseTime);

  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('10', 'Dylan', `O'Brien`, {
      middleName: 'MiD',
      suffix: 'I',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Ella', `Smith`, {
      middleName: 'Stephanie',
      suffix: '',
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('12', 'John', `Doe`, {
      middleName: 'A',
      suffix: 'Jr',
      precinct: 'precinct-1',
      party: 'UND',
    }),
    createVoter('13', 'Jane', `Smith`, {
      middleName: 'B',
      suffix: '',
      precinct: 'precinct-1',
      party: 'DEM',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );
  localStore.setConfiguredPrecinct('precinct-1');

  // Check in first voter at 9:05 AM
  vi.setSystemTime(new Date('2025-08-04T09:05:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[0].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Check in second voter at 9:20 AM (same 15-min interval)
  vi.setSystemTime(new Date('2025-08-04T09:20:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[1].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  // Check in third voter at 9:35 AM (next 15-min interval)
  vi.setSystemTime(new Date('2025-08-04T09:35:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[2].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Check in fourth voter at 10:10 AM (next hour)
  vi.setSystemTime(new Date('2025-08-04T10:10:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[3].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Set current time for generating throughput statistics
  vi.setSystemTime(new Date('2025-08-04T10:30:00.000Z'));

  // Test with different interval sizes
  const stats15min = localStore.getThroughputStatistics(15, 'ALL');
  const stats30min = localStore.getThroughputStatistics(30, 'ALL');
  const stats60min = localStore.getThroughputStatistics(60, 'ALL');

  // Verify 15-minute intervals
  expect(stats15min.length).toEqual(6); // From 9:00 to 10:30 = 6 intervals (9:00, 9:15, 9:30, 9:45, 10:00, 10:15)
  expect(stats15min[0].startTime).toEqual('2025-08-04T09:00:00.000Z');
  expect(stats15min[0].checkIns).toEqual(1); // Dylan at 9:05 (first interval 9:00-9:15)
  expect(stats15min[1].startTime).toEqual('2025-08-04T09:15:00.000Z');
  expect(stats15min[1].checkIns).toEqual(1); // Ella at 9:20 (second interval 9:15-9:30)
  expect(stats15min[2].startTime).toEqual('2025-08-04T09:30:00.000Z');
  expect(stats15min[2].checkIns).toEqual(1); // John at 9:35 (third interval 9:30-9:45)
  expect(stats15min[3].startTime).toEqual('2025-08-04T09:45:00.000Z');
  expect(stats15min[3].checkIns).toEqual(0); // No check-ins in this interval
  expect(stats15min[4].startTime).toEqual('2025-08-04T10:00:00.000Z');
  expect(stats15min[4].checkIns).toEqual(1); // Jane at 10:10 (fifth interval 10:00-10:15)
  expect(stats15min[5].startTime).toEqual('2025-08-04T10:15:00.000Z');
  expect(stats15min[5].checkIns).toEqual(0); // No check-ins in this interval

  // Verify 30-minute intervals
  expect(stats30min.length).toEqual(3); // From 9:00 to 10:30 = 3 intervals (9:00, 9:30, 10:00)
  expect(stats30min[0].startTime).toEqual('2025-08-04T09:00:00.000Z');
  expect(stats30min[0].checkIns).toEqual(2); // Dylan and Ella (9:05 and 9:20 both in 9:00-9:30)
  expect(stats30min[1].startTime).toEqual('2025-08-04T09:30:00.000Z');
  expect(stats30min[1].checkIns).toEqual(1); // John at 9:35 (9:30-10:00)
  expect(stats30min[2].startTime).toEqual('2025-08-04T10:00:00.000Z');
  expect(stats30min[2].checkIns).toEqual(1); // Jane at 10:10 (10:00-10:30)

  // Verify 60-minute intervals
  expect(stats60min.length).toEqual(2); // From 9:00 to 10:30 = 2 intervals (9:00, 10:00)
  expect(stats60min[0].startTime).toEqual('2025-08-04T09:00:00.000Z');
  expect(stats60min[0].checkIns).toEqual(3); // Dylan, Ella, and John (all in 9:00-10:00)
  expect(stats60min[1].startTime).toEqual('2025-08-04T10:00:00.000Z');
  expect(stats60min[1].checkIns).toEqual(1); // Jane at 10:10 (10:00-11:00)

  // Total check-ins across all intervals should be 4
  const total15min = stats15min.reduce((sum, stat) => sum + stat.checkIns, 0);
  const total30min = stats30min.reduce((sum, stat) => sum + stat.checkIns, 0);
  const total60min = stats60min.reduce((sum, stat) => sum + stat.checkIns, 0);

  expect(total15min).toEqual(4);
  expect(total30min).toEqual(4);
  expect(total60min).toEqual(4);

  // Verify each interval has the correct interval duration
  for (const stat of stats15min) {
    expect(stat.interval).toEqual(15);
  }
  for (const stat of stats30min) {
    expect(stat.interval).toEqual(30);
  }
  for (const stat of stats60min) {
    expect(stat.interval).toEqual(60);
  }

  // All startTime values should be valid ISO dates
  for (const stat of [...stats15min, ...stats30min, ...stats60min]) {
    expect(new Date(stat.startTime)).toBeInstanceOf(Date);
    expect(stat.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  }

  // Restore real timers
  vi.useRealTimers();
});

test('getThroughputStatistics with fake timers across multiple hours and intervals', () => {
  // Use fake timers to precisely control check-in times
  vi.useFakeTimers();

  // Set initial time to 8:00 AM
  vi.setSystemTime(new Date('2025-08-04T08:00:00.000Z'));

  const localStore = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const testElectionDefinition = getTestElectionDefinition();

  const voters = [
    createVoter('10', 'Alice', 'Johnson', {
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('11', 'Bob', 'Smith', { precinct: 'precinct-1', party: 'REP' }),
    createVoter('12', 'Charlie', 'Brown', {
      precinct: 'precinct-1',
      party: 'UND',
    }),
    createVoter('13', 'Diana', 'Davis', {
      precinct: 'precinct-1',
      party: 'DEM',
    }),
    createVoter('14', 'Eve', 'Wilson', {
      precinct: 'precinct-1',
      party: 'REP',
    }),
    createVoter('15', 'Frank', 'Miller', {
      precinct: 'precinct-1',
      party: 'UND',
    }),
  ];
  const streets = [createValidStreetInfo('PEGASUS', 'odd', 5, 15)];
  localStore.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    streets,
    voters
  );
  localStore.setConfiguredPrecinct('precinct-1');

  // Check-ins spread across multiple hours and intervals
  // First batch: 8:15 AM - 2 voters
  vi.setSystemTime(new Date('2025-08-04T08:15:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[0].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  localStore.recordVoterCheckIn({
    voterId: voters[1].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  // Second batch: 8:45 AM - 1 voter
  vi.setSystemTime(new Date('2025-08-04T08:45:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[2].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Third batch: 9:30 AM - 2 voters
  vi.setSystemTime(new Date('2025-08-04T09:30:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[3].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  localStore.recordVoterCheckIn({
    voterId: voters[4].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  // Fourth batch: 10:15 AM - 1 voter
  vi.setSystemTime(new Date('2025-08-04T10:15:00.000Z'));
  localStore.recordVoterCheckIn({
    voterId: voters[5].voterId,
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });

  // Set current time for generating statistics
  vi.setSystemTime(new Date('2025-08-04T10:30:00.000Z'));

  // Test 30-minute intervals
  const stats30min = localStore.getThroughputStatistics(30, 'ALL');
  expect(stats30min).toHaveLength(5); // 8:00-8:30, 8:30-9:00, 9:00-9:30, 9:30-10:00, 10:00-10:30

  expect(stats30min[0].startTime).toEqual('2025-08-04T08:00:00.000Z');
  expect(stats30min[0].checkIns).toEqual(2); // Alice and Bob at 8:15

  expect(stats30min[1].startTime).toEqual('2025-08-04T08:30:00.000Z');
  expect(stats30min[1].checkIns).toEqual(1); // Charlie at 8:45

  expect(stats30min[2].startTime).toEqual('2025-08-04T09:00:00.000Z');
  expect(stats30min[2].checkIns).toEqual(0); // No check-ins in this interval

  expect(stats30min[3].startTime).toEqual('2025-08-04T09:30:00.000Z');
  expect(stats30min[3].checkIns).toEqual(2); // Diana and Eve at 9:30

  expect(stats30min[4].startTime).toEqual('2025-08-04T10:00:00.000Z');
  expect(stats30min[4].checkIns).toEqual(1); // Frank at 10:15

  // Test DEM party filter
  const statsDem = localStore.getThroughputStatistics(30, 'DEM');
  expect(statsDem).toHaveLength(5);
  expect(statsDem[0].checkIns).toEqual(1); // Alice with DEM ballot at 8:15
  expect(statsDem[1].checkIns).toEqual(1); // Charlie with DEM ballot at 8:45
  expect(statsDem[2].checkIns).toEqual(0); // No DEM ballots in this interval
  expect(statsDem[3].checkIns).toEqual(1); // Diana with DEM ballot at 9:30
  expect(statsDem[4].checkIns).toEqual(1); // Frank with DEM ballot at 10:15

  // Test REP party filter
  const statsRep = localStore.getThroughputStatistics(30, 'REP');
  expect(statsRep).toHaveLength(5);
  expect(statsRep[0].checkIns).toEqual(1); // Bob with REP ballot at 8:15
  expect(statsRep[1].checkIns).toEqual(0); // No REP ballots in this interval
  expect(statsRep[2].checkIns).toEqual(0); // No REP ballots in this interval
  expect(statsRep[3].checkIns).toEqual(1); // Eve with REP ballot at 9:30
  expect(statsRep[4].checkIns).toEqual(0); // No REP ballots in this interval

  // Verify total check-ins across all intervals
  const totalAll = stats30min.reduce((sum, stat) => sum + stat.checkIns, 0);
  const totalDem = statsDem.reduce((sum, stat) => sum + stat.checkIns, 0);
  const totalRep = statsRep.reduce((sum, stat) => sum + stat.checkIns, 0);

  expect(totalAll).toEqual(6); // All 6 voters checked in
  expect(totalDem).toEqual(4); // 4 DEM ballot check-ins (Alice, Charlie, Diana, Frank)
  expect(totalRep).toEqual(2); // 2 REP ballot check-ins (Bob, Eve)

  // Restore real timers
  vi.useRealTimers();
});
