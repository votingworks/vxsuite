import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { safeParseSystemSettings } from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';
import { Store } from './store';
import { ElectionRecord, ScannerBatch } from './types';

test('create a file store', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(tmpDbPath);

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore();
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(':memory:');
});

test('add an election', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  store.assertElectionExists(electionId);
  expect(store.getElections().map((r) => r.id)).toContain(electionId);
  expect(store.getElection(electionId)).toMatchObject({
    electionDefinition: expect.anything(),
    id: electionId,
    createdAt: expect.anything(),
  });
  expect(store.getElection('not-an-id')).toEqual(undefined);
});

test('assert election exists', () => {
  const store = Store.memoryStore();
  expect(() => store.assertElectionExists('foo')).toThrowError(
    'Election not found: foo'
  );
});

test('setElectionResultsOfficial', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, true);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: true,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, false);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );
});

test('current election id', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(store.getCurrentElectionId()).toBeUndefined();

  store.setCurrentElectionId(electionId);
  expect(store.getCurrentElectionId()).toEqual(electionId);

  store.setCurrentElectionId(undefined);
  expect(store.getCurrentElectionId()).toBeUndefined();
});

/**
 * System settings tests
 */
function makeSystemSettings() {
  return safeParseSystemSettings(
    electionMinimalExhaustiveSampleFixtures.systemSettings.asText()
  ).unsafeUnwrap();
}

test('saveSystemSettings and getSystemSettings write and read system settings', () => {
  const store = Store.memoryStore();
  const systemSettings = makeSystemSettings();
  store.saveSystemSettings(systemSettings);
  const retrievedSystemSettings = store.getSystemSettings();
  expect(retrievedSystemSettings).toEqual(systemSettings);
});

test('getSystemSettings returns undefined when no system settings exist', () => {
  const store = Store.memoryStore();
  const retrievedSystemSettings = store.getSystemSettings();
  expect(retrievedSystemSettings).toBeUndefined();
});

test('scanner batches', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  expect(store.getScannerBatches(electionId)).toEqual([]);

  const scannerBatch: ScannerBatch = {
    electionId,
    batchId: 'batch-1',
    label: 'Batch 1',
    scannerId: 'VX-00-001',
  };
  store.addScannerBatch(scannerBatch);
  expect(store.getScannerBatches(electionId)).toEqual([scannerBatch]);

  store.deleteEmptyScannerBatches(electionId);
  expect(store.getScannerBatches(electionId)).toEqual([]);
});
