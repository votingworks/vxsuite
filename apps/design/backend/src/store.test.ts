import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { assert, assertDefined, err, ok } from '@votingworks/basics';

import {
  CandidateContest,
  Election,
  ElectionDefinition,
  ElectionId,
  LanguageCode,
  TtsEditKey,
} from '@votingworks/types';
import * as types from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { sha256 } from 'js-sha256';
import {
  allBaseBallotProps,
  renderAllBallotPdfsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import {
  MainExportTaskMetadata,
  Store,
  TaskName,
  TestDecksTaskMetadata,
} from './store';
import { TestStore } from '../test/test_store';
import {
  processNextBackgroundTaskIfAny,
  testSetupHelpers,
} from '../test/helpers';
import {
  jurisdictions,
  nonVxJurisdiction,
  nonVxOrganization,
  nonVxUser,
  organizations,
  supportUser,
  users,
  vxJurisdiction,
} from '../test/mocks';

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);

// Spy on the ballot rendering function so we can check that it's called with the
// right arguments.
vi.mock(import('@votingworks/hmpb'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderAllBallotPdfsAndCreateElectionDefinition: vi.fn(
      original.renderAllBallotPdfsAndCreateElectionDefinition
    ),
    layOutBallotsAndCreateElectionDefinition: vi.fn(
      original.layOutBallotsAndCreateElectionDefinition
    ),
  } as unknown as typeof original;
});

const { setupApp, cleanup } = testSetupHelpers();

beforeEach(async () => {
  vi.resetAllMocks();
  await testStore.init();
});

afterAll(async () => {
  await testStore.cleanUp();
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockRestore();
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

describe('tts_strings', () => {
  const key: TtsEditKey = {
    jurisdictionId: 'vx',
    original: 'one two',
    languageCode: 'en',
  };

  async function setUpJurisdictions(
    store: Store,
    ids: string[] = [key.jurisdictionId]
  ) {
    await store.createOrganization(nonVxOrganization);
    for (const id of ids) {
      await store.createJurisdiction({
        id,
        name: id,
        stateCode: 'DEMO',
        organization: nonVxOrganization,
      });
    }
  }

  test('ttsStringsGet returns null if absent', async () => {
    const store = testStore.getStore();
    await setUpJurisdictions(store);
    await expect(store.ttsEditsGet(key)).resolves.toBeNull();
  });

  test('ttsStringsSet inserts if absent, updates if present', async () => {
    const store = testStore.getStore();
    await setUpJurisdictions(store);

    await store.ttsEditsSet(key, {
      exportSource: 'phonetic',
      phonetic: [{ text: 'one' }, { text: 'two' }],
      text: 'one two',
    });

    await expect(store.ttsEditsGet(key)).resolves.toEqual({
      exportSource: 'phonetic',
      phonetic: [{ text: 'one' }, { text: 'two' }],
      text: 'one two',
    });

    await store.ttsEditsSet(key, {
      exportSource: 'phonetic',
      phonetic: [
        { text: 'one' },
        { syllables: [{ ipaPhonemes: ['t', 'uː'] }], text: 'two' },
      ],
      text: 'one two',
    });

    await expect(store.ttsEditsGet(key)).resolves.toEqual({
      exportSource: 'phonetic',
      phonetic: [
        { text: 'one' },
        { syllables: [{ ipaPhonemes: ['t', 'uː'] }], text: 'two' },
      ],
      text: 'one two',
    });
  });

  test('ttsStringsAll', async () => {
    const store = testStore.getStore();
    await setUpJurisdictions(store, [vxJurisdiction.id, nonVxJurisdiction.id]);

    await store.ttsEditsSet(
      {
        jurisdictionId: vxJurisdiction.id,
        languageCode: 'en',
        original: 'one two',
      },
      { exportSource: 'text', phonetic: [], text: 'wun too' }
    );
    await store.ttsEditsSet(
      {
        jurisdictionId: vxJurisdiction.id,
        languageCode: 'es',
        original: 'three four',
      },
      { exportSource: 'text', phonetic: [], text: 'three foar' }
    );

    await store.ttsEditsSet(
      {
        jurisdictionId: nonVxJurisdiction.id,
        languageCode: 'en',
        original: 'five six',
      },
      { exportSource: 'text', phonetic: [], text: 'fayv six' }
    );

    await expect(
      store.ttsEditsAll({ jurisdictionId: vxJurisdiction.id })
    ).resolves.toEqual([
      {
        exportSource: 'text',
        languageCode: 'en',
        original: 'one two',
        phonetic: [],
        text: 'wun too',
      },
      {
        exportSource: 'text',
        languageCode: 'es',
        original: 'three four',
        phonetic: [],
        text: 'three foar',
      },
    ]);
  });
});

test('getExportedElectionDefinition returns the exported election including reordering updates on render', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  const { apiClient, auth0, workspace, fileStorageClient } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);

  const electionId = (
    await apiClient.loadElection({
      newId: 'test-nh-election-id' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(baseElectionDefinition.election),
      },
    })
  ).unsafeUnwrap();

  // Set to NhBallot template which will reorder candidates
  await apiClient.setBallotTemplate({
    electionId,
    ballotTemplateId: 'NhBallot',
  });

  // Update election info to include signature (required for NH ballot template)
  (await apiClient.updateElectionInfo({
    electionId,
    jurisdictionId: nonVxJurisdiction.id,
    title: baseElectionDefinition.election.title,
    countyName: baseElectionDefinition.election.county.name,
    state: baseElectionDefinition.election.state,
    seal: baseElectionDefinition.election.seal,
    type: baseElectionDefinition.election.type,
    date: baseElectionDefinition.election.date,
    languageCodes: [LanguageCode.ENGLISH],
    signatureImage: 'data:image/png;base64,test-signature',
    signatureCaption: 'Test Signature',
  })).unsafeUnwrap();

  // Get the original candidate order and contest order from the base election
  const originalCandidateContest =
    baseElectionDefinition.election.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    );
  assert(originalCandidateContest);
  const originalCandidateIds = originalCandidateContest.candidates.map(
    (c) => c.id
  );
  const originalContestIds = baseElectionDefinition.election.contests.map(
    (c) => c.id
  );

  // Create a modified election with reordered candidates AND contests to simulate NH ballot template behavior
  const reorderedElection: Election = {
    ...baseElectionDefinition.election,
    // Reverse the contest order
    contests: [...baseElectionDefinition.election.contests]
      .reverse()
      .map((contest) => {
        if (
          contest.type === 'candidate' &&
          contest.id === originalCandidateContest.id
        ) {
          // Also reverse the candidate order within the contest
          return {
            ...contest,
            candidates: [...contest.candidates].reverse(),
          };
        }
        return contest;
      }),
    // Add signature required for NH ballot template
    signature: {
      image: 'data:image/png;base64,test-signature',
      caption: 'Test Signature',
    },
  };
  const reorderedElectionData = JSON.stringify(reorderedElection);
  const reorderedBallotHash = sha256(reorderedElectionData);
  const reorderedElectionDefinition: ElectionDefinition = {
    ...baseElectionDefinition,
    election: reorderedElection,
    electionData: reorderedElectionData,
    ballotHash: reorderedBallotHash,
  };

  // Mock the ballot rendering to return the reordered election
  const props = allBaseBallotProps(reorderedElection);
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockResolvedValue({
    ballotPdfs: props.map(() => Uint8Array.from('mock-pdf-contents')),
    electionDefinition: reorderedElectionDefinition,
  });

  // Export the election package
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });

  await processNextBackgroundTaskIfAny({
    fileStorageClient,
    workspace,
  });

  // Verify that the last exported ballot hash matches the mocked value we returned
  const { store } = workspace;
  const electionRecord = await store.getElection(electionId);
  expect(electionRecord.lastExportedBallotHash).toEqual(reorderedBallotHash);

  // Now get the exported election from the store using the election ID
  const exportedElectionDefinitionResult =
    await store.getExportedElectionDefinition(electionId);
  expect(exportedElectionDefinitionResult).toEqual(
    ok({
      election: expect.anything(), // checked below
      electionData: expect.anything(),
      ballotHash: reorderedBallotHash,
    })
  );
  const exportedData = assertDefined(exportedElectionDefinitionResult.ok());
  const { election: storedElection } = exportedData;

  // Verify that the stored election has the reordered contests (reversed from original)
  const storedContestIds = storedElection.contests.map((c) => c.id);
  const expectedReorderedContestIds = [...originalContestIds].reverse();
  expect(storedContestIds).toEqual(expectedReorderedContestIds);
  expect(storedContestIds).not.toEqual(originalContestIds);

  // Verify that the stored election has the reordered candidates (reversed from original)
  const storedCandidateContest = storedElection.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.id === originalCandidateContest.id
  );
  assert(storedCandidateContest);
  const storedCandidateIds = storedCandidateContest.candidates.map((c) => c.id);

  // The stored election should have reversed candidate order (simulating NH ballot template)
  const expectedReorderedCandidateIds = [...originalCandidateIds].reverse();
  expect(storedCandidateIds).toEqual(expectedReorderedCandidateIds);
  expect(storedCandidateIds).not.toEqual(originalCandidateIds);
});

test('createElectionPackageBackgroundTask clears previous export URLs', async () => {
  const { apiClient, auth0, workspace } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);

  const electionId = 'election-1';
  void (await apiClient.createElection({
    id: electionId,
    jurisdictionId: nonVxJurisdiction.id,
  }));

  const electionPackageUrl = '/files/electionPackage.zip';
  const officialBallotsUrl = '/files/officialBallots.zip';
  const sampleBallotsUrl = '/files/sampleBallots.zip';
  const testBallotsUrl = '/files/testBallots.zip';

  await workspace.store.setElectionPackageExportInformation({
    ballotHash: 'ballot-hash',
    electionData: 'election-data',
    electionId,
    electionPackageUrl,
    officialBallotsUrl,
    sampleBallotsUrl,
    testBallotsUrl,
  });
  {
    const exportMeta = await workspace.store.getElectionPackage(electionId);
    expect(exportMeta).toEqual<MainExportTaskMetadata>({
      task: undefined,

      electionPackageUrl,
      officialBallotsUrl,
      sampleBallotsUrl,
      testBallotsUrl,
    });
  }

  await workspace.store.createElectionPackageBackgroundTask({
    electionId,
    electionSerializationFormat: 'vxf',
  });
  {
    const exportMeta = await workspace.store.getElectionPackage(electionId);
    expect(exportMeta).toEqual<MainExportTaskMetadata>({
      task: expect.anything(),
    });
  }
});

test('createTestDecksBackgroundTask clears previous export URL', async () => {
  const { apiClient, auth0, workspace } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);

  const electionId = 'election-1';
  void (await apiClient.createElection({
    id: electionId,
    jurisdictionId: nonVxJurisdiction.id,
  }));

  const testDecksUrl = '/files/test-decks.zip';
  await workspace.store.setTestDecksUrl({ electionId, testDecksUrl });
  {
    const exportMeta = await workspace.store.getTestDecks(electionId);
    expect(exportMeta).toEqual<TestDecksTaskMetadata>({
      task: undefined,
      url: testDecksUrl,
    });
  }

  await workspace.store.createTestDecksBackgroundTask(electionId, 'vxf');
  {
    const exportMeta = await workspace.store.getTestDecks(electionId);
    expect(exportMeta).toEqual<TestDecksTaskMetadata>({
      task: expect.anything(),
    });
  }
});

test('getExportedElection returns election-out-of-date error when election data fails to parse', async () => {
  const baseElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  const { apiClient, auth0, workspace, fileStorageClient } = await setupApp({
    organizations,
    jurisdictions,
    users,
  });
  auth0.setLoggedInUser(nonVxUser);

  const electionId = (
    await apiClient.loadElection({
      newId: 'test-election-parse-error' as ElectionId,
      jurisdictionId: nonVxJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: JSON.stringify(baseElectionDefinition.election),
      },
    })
  ).unsafeUnwrap();

  // Mock the ballot rendering to return a valid election
  const props = allBaseBallotProps(baseElectionDefinition.election);
  vi.mocked(renderAllBallotPdfsAndCreateElectionDefinition).mockResolvedValue({
    ballotPdfs: props.map(() => Uint8Array.from('mock-pdf-contents')),
    electionDefinition: baseElectionDefinition,
  });

  // Export the election package
  await apiClient.exportElectionPackage({
    electionId,
    electionSerializationFormat: 'vxf',
    shouldExportAudio: false,
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });

  await processNextBackgroundTaskIfAny({
    fileStorageClient,
    workspace,
  });

  // Get the ballot hash from the stored election
  const { store } = workspace;
  const electionRecord = await store.getElection(electionId);
  assertDefined(electionRecord.lastExportedBallotHash);

  // Mock safeParseElection to return an error, simulating an outdated election schema
  const safeParseElectionSpy = vi.spyOn(types, 'safeParseElectionDefinition');
  safeParseElectionSpy.mockReturnValue(err(new Error('Parse error')));

  // Try to get the exported election - should fail because parsing fails
  const result = await store.getExportedElectionDefinition(electionId);

  // Should return an error indicating the election is out of date
  expect(result).toEqual(err('election-out-of-date'));

  // Restore the mock
  safeParseElectionSpy.mockRestore();
  await cleanup();
});

test('support users must have @voting.works or @vx.support email', async () => {
  const store = testStore.getStore();
  await testStore.init();

  await expect(
    store.createUser({
      ...supportUser,
      name: 'support.user@example.com',
    })
  ).rejects.toThrow(
    'Support users must have a @voting.works or @vx.support email'
  );
});
