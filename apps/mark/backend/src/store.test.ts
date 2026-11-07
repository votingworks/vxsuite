import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { assertDefined } from '@votingworks/basics';
import {
  safeParseSystemSettings,
  TEST_JURISDICTION,
  BallotType,
  constructElectionKey,
  type EncodedBallotEntry,
} from '@votingworks/types';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { importElectionPackageForTest } from '@votingworks/backend/test-utils';
import { asStoredElectionDefinition } from '@votingworks/test-utils';
import { Store } from './store.js';
import { configureStore } from '../test/store_helpers.js';

// We pause in some of these tests so we need to increase the timeout
vi.setConfig({
  testTimeout: 20_000,
});

test('getDbPath', () => {
  const store = Store.memoryStore();
  expect(store.getDbPath()).toEqual(':memory:');
});

test('get/set/has election', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const store = Store.memoryStore();

  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.getElectionKey()).toBeUndefined();
  expect(store.getJurisdiction()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();

  await configureStore(store, { electionDefinition });
  expect(store.getElectionRecord()).toEqual({
    electionDefinition: asStoredElectionDefinition(electionDefinition),
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.getElectionKey()).toEqual(
    constructElectionKey(electionDefinition.election)
  );
  expect(store.getJurisdiction()).toEqual(TEST_JURISDICTION);
  expect(store.hasElection()).toBeTruthy();

  store.reset();
  expect(store.getElectionRecord()).toBeUndefined();
});

test('close', () => {
  const store = Store.memoryStore();
  store.close();
  expect(() => store.hasElection()).toThrow(/is closed/);
  expect(() => store.getElectionRecord()).toThrow(/is closed/);
});

test('get system settings', async () => {
  const store = Store.memoryStore();

  expect(store.getSystemSettings()).toBeUndefined();
  const systemSettings = safeParseSystemSettings(
    electionTwoPartyPrimaryFixtures.systemSettings.asText()
  ).unsafeUnwrap();

  await configureStore(store, {
    electionDefinition:
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
    systemSettings,
  });
  expect(store.getSystemSettings()).toEqual(systemSettings);

  store.reset();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('reset clears the database', async () => {
  const store = Store.memoryStore();

  await configureStore(store, {
    electionDefinition:
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
  });
  expect(store.hasElection()).toBeTruthy();
  store.reset();
  expect(store.hasElection()).toBeFalsy();
});

test('get ballots', async () => {
  const store = Store.memoryStore();

  const mockBallotPdfData1 = 'mock-pdf-data-1';
  const mockBallotPdfData2 = 'mock-pdf-data-2';
  const mockBallotPdf1Base64 =
    Buffer.from(mockBallotPdfData1).toString('base64');
  const mockBallotPdf2Base64 =
    Buffer.from(mockBallotPdfData2).toString('base64');

  const mockBallotPdfData3 = 'mock-pdf-data-3';
  const mockBallotPdf3Base64 =
    Buffer.from(mockBallotPdfData3).toString('base64');

  await configureStore(store, {
    electionDefinition:
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
    ballots: [
      {
        ballotStyleId: '1M',
        precinctId: 'precinct-1',
        ballotType: BallotType.Precinct,
        ballotMode: 'official',
        encodedBallot: mockBallotPdf1Base64,
      },
      {
        ballotStyleId: '2F',
        precinctId: 'precinct-2',
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
        encodedBallot: mockBallotPdf2Base64,
      },
      {
        ballotStyleId: '2F',
        precinctId: 'precinct-2',
        ballotType: BallotType.Absentee,
        ballotMode: 'test',
        encodedBallot: mockBallotPdf3Base64,
      },
    ],
  });

  const retrievedBallot1 = assertDefined(
    store.getBallot({
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      isLiveMode: true, // should match 'official' mode
    })
  );
  expect(retrievedBallot1.encodedBallot).toEqual(mockBallotPdf1Base64);
  expect(retrievedBallot1.ballotType).toEqual(BallotType.Precinct);
  expect(retrievedBallot1.ballotMode).toEqual('official');

  const retrievedBallot2 = assertDefined(
    store.getBallot({
      ballotStyleId: '2F',
      precinctId: 'precinct-2',
      isLiveMode: false, // should match 'test' mode
    })
  );
  expect(retrievedBallot2.encodedBallot).toEqual(mockBallotPdf2Base64);
  expect(retrievedBallot2.ballotType).toEqual(BallotType.Precinct); // There is an absentee ballot with this style/precinct that should NOT be returned.
  expect(retrievedBallot2.ballotMode).toEqual('test');

  // Try to retrieve with wrong ballot style
  const wrongBallotStyle = store.getBallot({
    ballotStyleId: 'nonexistent-ballot-style',
    precinctId: 'precinct-1',
    isLiveMode: true,
  });
  expect(wrongBallotStyle).toBeUndefined();

  // Try to retrieve with wrong precinct
  const wrongPrecinct = store.getBallot({
    ballotStyleId: '1M',
    precinctId: 'nonexistent-precinct',
    isLiveMode: true,
  });
  expect(wrongPrecinct).toBeUndefined();

  // Try to retrieve with wrong isLiveMode
  const wrongMode1 = store.getBallot({
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    isLiveMode: false, // this is 'official' mode, so should not match 'test'
  });
  expect(wrongMode1).toBeUndefined();

  const wrongMode2 = store.getBallot({
    ballotStyleId: '2F',
    precinctId: 'precinct-2',
    isLiveMode: true, // this is 'test' mode, so should not match 'official'
  });
  expect(wrongMode2).toBeUndefined();
});

test('hasTestBallots', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const officialBallot: EncodedBallotEntry = {
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
    encodedBallot: Buffer.from('official-pdf').toString('base64'),
  };
  const store = Store.memoryStore();

  // No ballots at all.
  expect(store.hasTestBallots()).toEqual(false);

  // Only official ballots.
  await configureStore(store, {
    electionDefinition,
    ballots: [officialBallot],
  });
  expect(store.hasTestBallots()).toEqual(false);

  // Test ballots present.
  await configureStore(store, {
    electionDefinition,
    ballots: [
      officialBallot,
      {
        ...officialBallot,
        ballotMode: 'test',
        encodedBallot: Buffer.from('test-pdf').toString('base64'),
      },
    ],
  });
  expect(store.hasTestBallots()).toEqual(true);
});

test('getElectricalTestingStatusMessages and setElectricalTestingStatusMessage', () => {
  const store = Store.memoryStore();

  // Initially should be empty
  expect(store.getElectricalTestingStatusMessages()).toEqual([]);

  store.setElectricalTestingStatusMessage('card', 'Success');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    expect.objectContaining({
      component: 'card',
      statusMessage: 'Success',
    }),
  ]);

  store.setElectricalTestingStatusMessage('usbDrive', 'Success');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    expect.objectContaining({
      component: 'card',
      statusMessage: 'Success',
    }),
    expect.objectContaining({
      component: 'usbDrive',
      statusMessage: 'Success',
    }),
  ]);

  store.setElectricalTestingStatusMessage('card', 'Error: No card');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    expect.objectContaining({
      component: 'card',
      statusMessage: 'Error: No card',
    }),
    expect.objectContaining({
      component: 'usbDrive',
      statusMessage: 'Success',
    }),
  ]);
});

test('get/set barcode activation mode', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const store = Store.memoryStore();

  expect(store.getBarcodeActivationMode()).toEqual('voter_session');
  expect(() => store.setBarcodeActivationMode('ballot_printing')).toThrow(
    'Cannot set barcode activation mode without an election.'
  );

  await configureStore(store, { electionDefinition });
  expect(store.getBarcodeActivationMode()).toEqual('voter_session');

  store.setBarcodeActivationMode('ballot_printing');
  expect(store.getBarcodeActivationMode()).toEqual('ballot_printing');

  store.setBarcodeActivationMode('voter_session');
  expect(store.getBarcodeActivationMode()).toEqual('voter_session');
});

test('an imported package without an election session is not configured', async () => {
  const store = Store.memoryStore();
  await importElectionPackageForTest(store.getElectionPackageStore(), {
    electionDefinition:
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
  });

  expect(store.hasElection()).toEqual(false);
  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.getElectionKey()).toBeUndefined();
});
