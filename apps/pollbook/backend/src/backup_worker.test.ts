import { expect, test, vitest } from 'vitest';
import { writeFileSync } from 'node:fs';
import { makeTemporaryPath } from '@votingworks/fixtures';
import { ElectionDefinition, PrecinctId } from '@votingworks/types';
import {
  createVoter,
  getTestElection,
  setupTestElectionAndVoters,
} from '../test/test_helpers';
import { getBackupPaperChecklistPdfs } from './backup_worker';
import { LocalStore } from './local_store';
import { EventType, VoterRegistrationEvent } from './types';

vitest.setConfig({
  testTimeout: 55_000,
});

test('can export paper backup checklist for multi precinct election', async () => {
  const store = LocalStore.memoryStore();
  setupTestElectionAndVoters(store);
  // Set up a configured precinct for multi-precinct testing
  store.setConfiguredPrecinct('precinct-1');
  store.recordVoterCheckIn({
    voterId: 'abigail',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  store.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
    ballotParty: 'REP',
  });

  // Create mock events from other pollbooks to simulate a populated cover page.
  const remoteEvents: VoterRegistrationEvent[] = Array.from(
    { length: 20 },
    (_, i) => ({
      type: EventType.VoterRegistration,
      machineId: `machine-${i + 1}`,
      receiptNumber: 1,
      timestamp: {
        physical: new Date('2025-01-01').getTime(),
        logical: 0,
        machineId: `machine-${i + 1}`,
      },
      voterId: `voter-${i + 1}`,
      registrationData: {
        ...createVoter(`voter-${i + 1}`, `First${i}`, `Last${i}`),
        streetSuffix: '',
        addressLine2: '',
        city: 'Somewhere',
        zipCode: '12345',
        timestamp: new Date('2025-01-01').toISOString(),
      },
      // Add other required fields if necessary
    })
  );

  for (const event of remoteEvents) {
    store.saveEvent(event);
  }
  const pdfs = await getBackupPaperChecklistPdfs(store, new Date('2024-01-01'));
  // The backup should be split into two files.
  expect(pdfs.length).toEqual(2);

  const pt1Path = makeTemporaryPath();
  const pt2Path = makeTemporaryPath();
  writeFileSync(pt1Path, pdfs[0]);
  writeFileSync(pt2Path, pdfs[1]);
  await expect(pt1Path).toMatchPdfSnapshot();
  await expect(pt2Path).toMatchPdfSnapshot();
});

test('backup checklist works for single-precinct election', async () => {
  const store = LocalStore.memoryStore();

  // Create a single-precinct election
  const baseElection = getTestElection();
  const singlePrecinctElection: typeof baseElection = {
    ...baseElection,
    precincts: [baseElection.precincts[0]], // Only one precinct
  };

  const singlePrecinctElectionDefinition: ElectionDefinition = {
    election: singlePrecinctElection,
    electionData: '',
    ballotHash: 'test-ballot-hash',
  };

  const testVoters = [createVoter('voter1', 'Test', 'Voter')];
  const testStreetInfo = [
    {
      streetName: 'Main',
      side: 'even' as const,
      lowRange: 2,
      highRange: 100,
      postalCityTown: 'Somewhere',
      zip5: '12345',
      zip4: '6789',
      precinct: 'precinct-0' as PrecinctId,
    },
  ];

  store.setElectionAndVoters(
    singlePrecinctElectionDefinition,
    'mock-package-hash',
    testStreetInfo,
    testVoters
  );

  const pdfs = await getBackupPaperChecklistPdfs(store, new Date('2024-01-01'));

  // Should generate PDFs successfully for single-precinct election
  expect(pdfs.length).toEqual(2);

  const pt1Path = makeTemporaryPath();
  const pt2Path = makeTemporaryPath();
  writeFileSync(pt1Path, pdfs[0]);
  writeFileSync(pt2Path, pdfs[1]);
  await expect(pt1Path).toMatchPdfSnapshot();
  await expect(pt2Path).toMatchPdfSnapshot();
});
