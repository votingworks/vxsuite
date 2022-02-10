import { asElectionDefinition } from '@votingworks/fixtures';
import { election } from '../test/fixtures/state-of-hamilton';
import { Store } from './store';

test('get/set current election', () => {
  const store = Store.memoryStore();

  expect(store.getCurrentElection()).toBeUndefined();

  const addedElection = store.addElection(asElectionDefinition(election));
  store.setCurrentElection(addedElection.test.id);
  expect(store.getCurrentElection()?.definition.election).toEqual(election);

  store.setCurrentElection();
  expect(store.getCurrentElection()).toBeUndefined();
});

test('get/set test mode', () => {
  const store = Store.memoryStore();

  expect(store.getTestMode()).toBeUndefined();

  const addedElection = store.addElection(asElectionDefinition(election));

  store.setCurrentElection(addedElection.test.id);
  expect(store.getTestMode()).toBe(true);

  expect(store.setTestMode(false)).toEqual(addedElection.live.id);
  expect(store.getTestMode()).toBe(false);

  expect(store.setTestMode(true)).toEqual(addedElection.test.id);
  expect(store.getTestMode()).toBe(true);
});

test('get/set mark threshold overrides', () => {
  const store = Store.memoryStore();
  const { live } = store.addElection(asElectionDefinition(election));
  store.setCurrentElection(live.id);

  expect(store.getMarkThresholdOverrides()).toBe(undefined);

  store.setMarkThresholdOverrides({ definite: 0.6, marginal: 0.5 });
  expect(store.getMarkThresholdOverrides()).toStrictEqual({
    definite: 0.6,
    marginal: 0.5,
  });

  store.setMarkThresholdOverrides(undefined);
  expect(store.getMarkThresholdOverrides()).toBe(undefined);
});

test('batch cleanup works correctly', () => {
  const store = Store.memoryStore();

  const firstBatchId = store.addBatch();
  store.addBatch();
  store.finishCurrentBatch();
  store.cleanupIncompleteBatches();

  const batches = store.batchStatus();
  expect(batches).toHaveLength(1);
  expect(batches[0].id).toEqual(firstBatchId);
  expect(batches[0].label).toEqual('Batch 1');

  const thirdBatchId = store.addBatch();
  store.addBatch();
  store.finishCurrentBatch();
  store.cleanupIncompleteBatches();
  const updatedBatches = store.batchStatus();
  expect(
    [...updatedBatches].sort((a, b) => a.label.localeCompare(b.label))
  ).toEqual([
    expect.objectContaining({
      id: firstBatchId,
      label: 'Batch 1',
    }),
    expect.objectContaining({
      id: thirdBatchId,
      label: 'Batch 3',
    }),
  ]);
});
