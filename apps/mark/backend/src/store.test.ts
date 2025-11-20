import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  safeParseSystemSettings,
  TEST_JURISDICTION,
  EncodedBallotEntry,
  BallotType,
} from '@votingworks/types';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { Store } from './store';

// We pause in some of these tests so we need to increase the timeout
vi.setConfig({
  testTimeout: 20_000,
});

const jurisdiction = TEST_JURISDICTION;

test('getDbPath', () => {
  const store = Store.memoryStore();
  expect(store.getDbPath()).toEqual(':memory:');
});

test('get/set/has election', () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const store = Store.memoryStore();

  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.getElectionRecord()).toEqual({
    electionDefinition,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.hasElection()).toBeTruthy();

  store.setElectionAndJurisdiction(undefined);
  expect(store.getElectionRecord()).toBeUndefined();
});

test('get/set/delete system settings', () => {
  const store = Store.memoryStore();

  expect(store.getSystemSettings()).toBeUndefined();
  const systemSettings = safeParseSystemSettings(
    electionTwoPartyPrimaryFixtures.systemSettings.asText()
  ).unsafeUnwrap();

  store.setSystemSettings(systemSettings);
  expect(store.getSystemSettings()).toEqual(systemSettings);

  store.deleteSystemSettings();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('errors when election definition cannot be parsed', () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: '{malformed json',
    jurisdiction,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(() => store.getElectionRecord()).toThrow(SyntaxError);
});

test('reset clears the database', () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const store = Store.memoryStore();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.hasElection()).toBeTruthy();
  store.reset();
  expect(store.hasElection()).toBeFalsy();
});

test('get/set/delete ballots', () => {
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

  const ballots: EncodedBallotEntry[] = [
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
  ];

  // Store ballots
  store.setBallots(ballots);

  // Retrieve and verify ballots
  const retrievedBallot1 = store.getBallot({
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    isLiveMode: true, // should match 'official' mode
  });
  expect(retrievedBallot1.encodedBallot).toEqual(mockBallotPdf1Base64);
  expect(retrievedBallot1.ballotType).toEqual(BallotType.Precinct);
  expect(retrievedBallot1.ballotMode).toEqual('official');

  const retrievedBallot2 = store.getBallot({
    ballotStyleId: '2F',
    precinctId: 'precinct-2',
    isLiveMode: false, // should match 'test' mode
  });
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

  // Delete all ballots
  store.deleteBallots();

  // Verify deletion - trying to get a ballot should return null/undefined
  const deletedBallot = store.getBallot({
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    isLiveMode: true,
  });
  expect(deletedBallot).toBeUndefined();
});
