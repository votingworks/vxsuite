import { expect, test, vitest } from 'vitest';
import { tmpNameSync } from 'tmp';
import { writeFileSync } from 'node:fs';
import { createVoter, setupTestElectionAndVoters } from '../test/test_helpers';
import { getBackupPaperChecklistPdfs } from './backup_worker';
import { LocalStore } from './local_store';
import { EventType, VoterRegistrationEvent } from './types';

vitest.setConfig({
  testTimeout: 45_000,
});

test('can export paper backup checklist', async () => {
  const store = LocalStore.memoryStore();
  setupTestElectionAndVoters(store);
  store.recordVoterCheckIn({
    voterId: 'abigail',
    identificationMethod: { type: 'default' },
  });
  store.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
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

  const pt1Path = tmpNameSync();
  const pt2Path = tmpNameSync();
  writeFileSync(pt1Path, pdfs[0]);
  writeFileSync(pt2Path, pdfs[1]);
  await expect(pt1Path).toMatchPdfSnapshot();
  await expect(pt2Path).toMatchPdfSnapshot();
});
