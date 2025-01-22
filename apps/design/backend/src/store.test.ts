import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { assertDefined } from '@votingworks/basics';

import { LanguageCode } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { TaskName } from './store';
import { TestStore } from '../test/test_store';

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);

beforeEach(async () => {
  await testStore.init();
});

afterAll(async () => {
  await testStore.cleanUp();
});

test('Translation cache', async () => {
  const store = testStore.getStore();

  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.SPANISH
    )
  ).toEqual(undefined);
  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual(undefined);

  // Add a Spanish translation
  await store.addTranslationCacheEntry({
    text: 'Happy birthday!',
    targetLanguageCode: LanguageCode.SPANISH,
    translatedText: '¡Feliz cumpleaños!',
  });
  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.SPANISH
    )
  ).toEqual('¡Feliz cumpleaños!');
  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual(undefined);

  // Add a Chinese translation
  await store.addTranslationCacheEntry({
    text: 'Happy birthday!',
    targetLanguageCode: LanguageCode.CHINESE_TRADITIONAL,
    translatedText: '生日快乐！',
  });
  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.SPANISH
    )
  ).toEqual('¡Feliz cumpleaños!');
  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual('生日快乐！');

  // Update the Spanish translation
  await store.addTranslationCacheEntry({
    text: 'Happy birthday!',
    targetLanguageCode: LanguageCode.SPANISH,
    translatedText: '¡Feliz cumpleaños! 🥳',
  });
  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.SPANISH
    )
  ).toEqual('¡Feliz cumpleaños! 🥳');
  expect(
    await store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual('生日快乐！');
});

test('Speech synthesis cache', async () => {
  const { ENGLISH, SPANISH } = LanguageCode;
  const store = testStore.getStore();

  expect(
    await store.getAudioClipBase64FromCache({
      languageCode: ENGLISH,
      text: 'cliché',
    })
  ).toEqual(undefined);
  expect(
    await store.getAudioClipBase64FromCache({
      languageCode: SPANISH,
      text: 'cliché',
    })
  ).toEqual(undefined);

  // Add an audio clip
  await store.addSpeechSynthesisCacheEntry({
    languageCode: ENGLISH,
    text: 'cliché',
    audioClipBase64: 'SomeBase64Value',
  });
  expect(
    await store.getAudioClipBase64FromCache({
      languageCode: ENGLISH,
      text: 'cliché',
    })
  ).toEqual('SomeBase64Value');
  expect(
    await store.getAudioClipBase64FromCache({
      languageCode: SPANISH,
      text: 'cliché',
    })
  ).toBeUndefined();

  // Update the audio clip
  await store.addSpeechSynthesisCacheEntry({
    languageCode: ENGLISH,
    text: 'cliché',
    audioClipBase64: 'AnotherBase64Value',
  });
  await store.addSpeechSynthesisCacheEntry({
    languageCode: SPANISH,
    text: 'cliché',
    audioClipBase64: 'OtroValorBase64',
  });

  expect(
    await store.getAudioClipBase64FromCache({
      languageCode: ENGLISH,
      text: 'cliché',
    })
  ).toEqual('AnotherBase64Value');
  expect(
    await store.getAudioClipBase64FromCache({
      languageCode: SPANISH,
      text: 'cliché',
    })
  ).toEqual('OtroValorBase64');
});

test('Background task processing - task creation and retrieval', async () => {
  const store = testStore.getStore();
  const taskName = 'some_task_name' as TaskName;

  expect(await store.getOldestQueuedBackgroundTask()).toEqual(undefined);

  const task1Id = await store.createBackgroundTask(taskName, {
    somePayload: 1,
  });
  const task2Id = await store.createBackgroundTask(taskName, {
    somePayload: 2,
  });

  expect(await store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    taskName,
  });

  expect(await store.getBackgroundTask(task1Id)).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    taskName,
  });
  expect(await store.getBackgroundTask(task2Id)).toEqual({
    createdAt: expect.any(Date),
    id: task2Id,
    payload: '{"somePayload":2}',
    taskName,
  });
  expect(await store.getBackgroundTask('non-existent-task-id')).toEqual(
    undefined
  );
});

test('Background task processing - starting and completing tasks', async () => {
  const store = testStore.getStore();
  const taskName = 'some_task_name' as TaskName;

  expect(await store.getOldestQueuedBackgroundTask()).toEqual(undefined);

  const task1Id = await store.createBackgroundTask(taskName, {
    somePayload: 1,
  });
  const task2Id = await store.createBackgroundTask(taskName, {
    somePayload: 2,
  });

  expect(await store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    taskName,
  });

  // Start a task
  await store.startBackgroundTask(task1Id);
  expect(await store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task2Id,
    payload: '{"somePayload":2}',
    taskName,
  });
  expect(await store.getBackgroundTask(task1Id)).toEqual({
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    startedAt: expect.any(Date),
    taskName,
  });

  // Complete a task
  await store.completeBackgroundTask(task1Id);
  expect(await store.getOldestQueuedBackgroundTask()).toEqual({
    createdAt: expect.any(Date),
    id: task2Id,
    payload: '{"somePayload":2}',
    taskName,
  });
  expect(await store.getBackgroundTask(task1Id)).toEqual({
    completedAt: expect.any(Date),
    createdAt: expect.any(Date),
    id: task1Id,
    payload: '{"somePayload":1}',
    startedAt: expect.any(Date),
    taskName,
  });

  // Complete a task with an error
  await store.startBackgroundTask(task2Id);
  await store.completeBackgroundTask(task2Id, 'Whoa!');
  expect(await store.getOldestQueuedBackgroundTask()).toEqual(undefined);
  expect(await store.getBackgroundTask(task2Id)).toEqual({
    completedAt: expect.any(Date),
    createdAt: expect.any(Date),
    error: 'Whoa!',
    id: task2Id,
    payload: '{"somePayload":2}',
    startedAt: expect.any(Date),
    taskName,
  });
});

test('Background task processing - requeuing interrupted tasks', async () => {
  const store = testStore.getStore();
  const taskName = 'some_task_name' as TaskName;

  const task1Id = await store.createBackgroundTask(taskName, {
    somePayload: 1,
  });
  const task2Id = await store.createBackgroundTask(taskName, {
    somePayload: 2,
  });
  const task3Id = await store.createBackgroundTask(taskName, {
    somePayload: 3,
  });
  const task4Id = await store.createBackgroundTask(taskName, {
    somePayload: 4,
  });

  await store.startBackgroundTask(task1Id);
  await store.completeBackgroundTask(task1Id);
  await store.startBackgroundTask(task2Id);
  await store.startBackgroundTask(task3Id);

  async function expectTaskToBeQueued(taskId: string): Promise<void> {
    const task = assertDefined(await store.getBackgroundTask(taskId));
    expect(task.startedAt).not.toBeDefined();
    expect(task.completedAt).not.toBeDefined();
  }

  async function expectTaskToBeStartedButNotCompleted(
    taskId: string
  ): Promise<void> {
    const task = assertDefined(await store.getBackgroundTask(taskId));
    expect(task.startedAt).toBeDefined();
    expect(task.completedAt).not.toBeDefined();
  }

  async function expectTaskToBeCompleted(taskId: string): Promise<void> {
    const task = assertDefined(await store.getBackgroundTask(taskId));
    expect(task.startedAt).toBeDefined();
    expect(task.completedAt).toBeDefined();
  }

  await expectTaskToBeCompleted(task1Id);
  await expectTaskToBeStartedButNotCompleted(task2Id);
  await expectTaskToBeStartedButNotCompleted(task3Id);
  await expectTaskToBeQueued(task4Id);

  await store.requeueInterruptedBackgroundTasks();

  await expectTaskToBeCompleted(task1Id);
  await expectTaskToBeQueued(task2Id);
  await expectTaskToBeQueued(task3Id);
  await expectTaskToBeQueued(task4Id);
});
