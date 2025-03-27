import { expect, test, vitest } from 'vitest';
import { tmpNameSync } from 'tmp';
import { writeFileSync } from 'node:fs';
import { setupTestElectionAndVoters } from '../test/test_helpers';
import { Store } from './store';
import { getBackupPaperChecklistPdfs } from './backup_worker';

vitest.setConfig({
  testTimeout: 10_000,
});

test('can export paper backup checklist', async () => {
  const store = Store.memoryStore();
  setupTestElectionAndVoters(store);
  store.recordVoterCheckIn({
    voterId: 'abigail',
    identificationMethod: { type: 'default' },
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
