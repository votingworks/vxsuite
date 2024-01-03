import { LanguageCode } from '@votingworks/types';

import { Store, TaskName } from './store';

test('Translation cache', () => {
  const store = Store.memoryStore();

  expect(
    store.getTranslatedTextFromCache('Happy birthday!', LanguageCode.SPANISH)
  ).toEqual(undefined);
  expect(
    store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual(undefined);

  // Add a Spanish translation
  store.addTranslationCacheEntry({
    text: 'Happy birthday!',
    targetLanguageCode: LanguageCode.SPANISH,
    translatedText: '¡Feliz cumpleaños!',
  });
  expect(
    store.getTranslatedTextFromCache('Happy birthday!', LanguageCode.SPANISH)
  ).toEqual('¡Feliz cumpleaños!');
  expect(
    store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual(undefined);

  // Add a Chinese translation
  store.addTranslationCacheEntry({
    text: 'Happy birthday!',
    targetLanguageCode: LanguageCode.CHINESE_TRADITIONAL,
    translatedText: '生日快乐！',
  });
  expect(
    store.getTranslatedTextFromCache('Happy birthday!', LanguageCode.SPANISH)
  ).toEqual('¡Feliz cumpleaños!');
  expect(
    store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual('生日快乐！');

  // Update the Spanish translation
  store.addTranslationCacheEntry({
    text: 'Happy birthday!',
    targetLanguageCode: LanguageCode.SPANISH,
    translatedText: '¡Feliz cumpleaños! 🥳',
  });
  expect(
    store.getTranslatedTextFromCache('Happy birthday!', LanguageCode.SPANISH)
  ).toEqual('¡Feliz cumpleaños! 🥳');
  expect(
    store.getTranslatedTextFromCache(
      'Happy birthday!',
      LanguageCode.CHINESE_TRADITIONAL
    )
  ).toEqual('生日快乐！');
});

test('Speech synthesis cache', () => {
  const store = Store.memoryStore();

  expect(store.getAudioClipBase64FromCache('Happy birthday!')).toEqual(
    undefined
  );

  // Add an audio clip
  store.addSpeechSynthesisCacheEntry({
    text: 'Happy birthday!',
    audioClipBase64: 'SomeBase64Value',
  });
  expect(store.getAudioClipBase64FromCache('Happy birthday!')).toEqual(
    'SomeBase64Value'
  );

  // Update the audio clip
  store.addSpeechSynthesisCacheEntry({
    text: 'Happy birthday!',
    audioClipBase64: 'AnotherBase64Value',
  });
  expect(store.getAudioClipBase64FromCache('Happy birthday!')).toEqual(
    'AnotherBase64Value'
  );
});

test('Background task processing - task creation and retrieval', () => {
  const store = Store.memoryStore();
  const taskName = 'some_task_name' as TaskName;

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
  const taskName = 'some_task_name' as TaskName;

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
