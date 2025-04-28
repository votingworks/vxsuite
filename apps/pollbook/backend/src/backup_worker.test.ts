import { expect, test, vitest } from 'vitest';
import { tmpNameSync } from 'tmp';
import { writeFileSync } from 'node:fs';
import { setupTestElectionAndVoters } from '../test/test_helpers';
import { getBackupPaperChecklistPdfs } from './backup_worker';
import { LocalStore } from './local_store';

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
