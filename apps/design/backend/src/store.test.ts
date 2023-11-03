import { Store } from './store';

const taskName = 'someTaskName';

test('Background task processing - task creation and retrieval', () => {
  const store = Store.memoryStore();

  expect(store.getOldestQueuedBackgroundTask()).toEqual(undefined);

  const task1Id = store.createBackgroundTask(taskName, {
    somePayload: 1,
  });
  const task2Id = store.createBackgroundTask(taskName, {
    somePayload: 2,
  });

  expect(store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    taskName,
  });

  expect(store.getBackgroundTask(task1Id)).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    taskName,
  });
  expect(store.getBackgroundTask(task2Id)).toEqual({
    createdAt: expect.any(Date),
    id: task2Id,
    payload: '{"somePayload":2}',
    taskName,
  });
  expect(store.getBackgroundTask('non-existent-task-id')).toEqual(undefined);
});

test('Background task processing - starting and completing tasks', () => {
  const store = Store.memoryStore();

  expect(store.getOldestQueuedBackgroundTask()).toEqual(undefined);

  const task1Id = store.createBackgroundTask(taskName, {
    somePayload: 1,
  });
  const task2Id = store.createBackgroundTask(taskName, {
    somePayload: 2,
  });

  expect(store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    taskName,
  });

  // Start a task
  store.startBackgroundTask(task1Id);
  expect(store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task2Id,
    payload: '{"somePayload":2}',
    taskName,
  });
  expect(store.getBackgroundTask(task1Id)).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    startedAt: expect.any(Date),
    taskName,
  });

  // Complete a task
  store.completeBackgroundTask(task1Id);
  expect(store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task2Id,
    payload: '{"somePayload":2}',
    taskName,
  });
  expect(store.getBackgroundTask(task1Id)).toEqual({
    completedAt: expect.any(Date),
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    startedAt: expect.any(Date),
    taskName,
  });

  // Complete a task with an error
  store.startBackgroundTask(task2Id);
  store.completeBackgroundTask(task2Id, 'Whoa!');
  expect(store.getOldestQueuedBackgroundTask()).toEqual(undefined);
  expect(store.getBackgroundTask(task2Id)).toEqual({
    completedAt: expect.any(Date),
    createdAt: expect.any(Date),
    error: 'Whoa!',
    id: task2Id,
    payload: '{"somePayload":2}',
    startedAt: expect.any(Date),
    taskName,
  });
});
