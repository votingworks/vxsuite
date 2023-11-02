import { Store } from './store';

test('Background task processing - task creation and retrieval', () => {
  const store = Store.memoryStore();

  expect(store.getQueuedBackgroundTasks()).toEqual([]);

  store.createBackgroundTask('someTaskName', { somePayload: 1 });
  store.createBackgroundTask('someTaskName', { somePayload: 2 });
  store.createBackgroundTask('someTaskName', { somePayload: 3 });

  const queuedTasks = store.getQueuedBackgroundTasks();
  expect(queuedTasks).toEqual([
    {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: '{"somePayload":1}',
      taskName: 'someTaskName',
    },
    {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: '{"somePayload":2}',
      taskName: 'someTaskName',
    },
    {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: '{"somePayload":3}',
      taskName: 'someTaskName',
    },
  ]);
  const task1Id = queuedTasks[0].id;
  const task2Id = queuedTasks[1].id;
  const task3Id = queuedTasks[2].id;

  expect(store.getBackgroundTask(task1Id)).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    taskName: 'someTaskName',
  });
  expect(store.getBackgroundTask(task2Id)).toEqual({
    createdAt: expect.any(Date),
    id: task2Id,
    payload: '{"somePayload":2}',
    taskName: 'someTaskName',
  });
  expect(store.getBackgroundTask(task3Id)).toEqual({
    createdAt: expect.any(Date),
    id: task3Id,
    payload: '{"somePayload":3}',
    taskName: 'someTaskName',
  });
});

test('Background task processing - starting and completing tasks', () => {
  const store = Store.memoryStore();

  expect(store.getQueuedBackgroundTasks()).toEqual([]);

  store.createBackgroundTask('someTaskName', { somePayload: 1 });
  store.createBackgroundTask('someTaskName', { somePayload: 2 });

  const queuedTasks = store.getQueuedBackgroundTasks();
  expect(queuedTasks).toEqual([
    {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: '{"somePayload":1}',
      taskName: 'someTaskName',
    },
    {
      createdAt: expect.any(Date),
      id: expect.any(String),
      payload: '{"somePayload":2}',
      taskName: 'someTaskName',
    },
  ]);
  const task1Id = queuedTasks[0].id;
  const task2Id = queuedTasks[1].id;

  // Start a task
  store.startBackgroundTask(task1Id);
  expect(store.getQueuedBackgroundTasks()).toEqual([
    {
      createdAt: expect.any(Date),
      id: task2Id,
      payload: '{"somePayload":2}',
      taskName: 'someTaskName',
    },
  ]);
  expect(store.getBackgroundTask(task1Id)).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    startedAt: expect.any(Date),
    taskName: 'someTaskName',
  });

  // Complete a task
  store.completeBackgroundTask(task1Id);
  expect(store.getQueuedBackgroundTasks()).toEqual([
    {
      createdAt: expect.any(Date),
      id: task2Id,
      payload: '{"somePayload":2}',
      taskName: 'someTaskName',
    },
  ]);
  expect(store.getBackgroundTask(task1Id)).toEqual({
    completedAt: expect.any(Date),
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    startedAt: expect.any(Date),
    taskName: 'someTaskName',
  });

  // Complete a task with an error
  store.startBackgroundTask(task2Id);
  store.completeBackgroundTask(task2Id, 'someError');
  expect(store.getQueuedBackgroundTasks()).toEqual([]);
  expect(store.getBackgroundTask(task2Id)).toEqual({
    completedAt: expect.any(Date),
    createdAt: expect.any(Date),
    error: 'someError',
    id: task2Id,
    payload: '{"somePayload":2}',
    startedAt: expect.any(Date),
    taskName: 'someTaskName',
  });
});
