/* istanbul ignore file - test util */

import {
  ElectionDefinition,
  ElectionPackage,
  UiStringAudioClips,
  UiStringAudioIdsPackage,
  UiStringsPackage,
} from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { Result, assertDefined } from '@votingworks/basics';
import { UiStringsStore } from './ui_strings_store';
import { mockElectionPackageFileTree } from '../election_package/test_utils';

type MockUsbDriveLike = Pick<MockUsbDrive, 'insertUsbDrive'>;

/** Test context for {@link runUiStringMachineConfigurationTests}. */
export interface UiStringConfigTestContext {
  electionDefinition: ElectionDefinition;
  getMockUsbDrive(): MockUsbDriveLike;
  runConfigureMachine(): Promise<Result<unknown, unknown>>;
  store: UiStringsStore;
}

/**
 * Tests the loading of strings translations and audio into the store when
 * configuring a machine from a USB election package.
 */
export function runUiStringMachineConfigurationTests(
  context: UiStringConfigTestContext
): void {
  const { electionDefinition, getMockUsbDrive, runConfigureMachine, store } =
    context;
  const expectedElectionStrings = electionDefinition.election.ballotStrings;

  async function doTestConfigure(usbElectionPackage: ElectionPackage) {
    getMockUsbDrive().insertUsbDrive(
      await mockElectionPackageFileTree(usbElectionPackage)
    );

    const result = await runConfigureMachine();
    expect(result.err()).toBeUndefined();
  }

  test('loads all available UI strings', async () => {
    const appStrings: UiStringsPackage = {
      en: { foo: 'bar', deeply: { nested: 'value' } },
      'es-US': { foo: 'bar_es', deeply: { nested: 'value_es' } },
    };

    await doTestConfigure({ electionDefinition, uiStrings: appStrings });

    expect(store.getLanguages().sort()).toEqual(['en', 'es-US'].sort());
    expect(store.getUiStrings('en')).toEqual({
      ...assertDefined(appStrings['en']),
      ...assertDefined(expectedElectionStrings['en']),
    });
    expect(store.getUiStrings('es-US')).toEqual(appStrings['es-US']);
    expect(store.getUiStrings('zh-Hant')).toBeNull();

    expect(store.getAllUiStrings()).toEqual({
      en: store.getUiStrings('en'),
      'es-US': store.getUiStrings('es-US'),
    });
  });

  test('is a no-op for missing uiStrings package', async () => {
    await doTestConfigure({ electionDefinition });

    expect(store.getLanguages()).toEqual(['en']);
    expect(store.getUiStrings('en')).toEqual(expectedElectionStrings['en']);
    expect(store.getUiStrings('es-US')).toBeNull();
  });

  test('loads UI string audio IDs for configured languages', async () => {
    const uiStrings: UiStringsPackage = {
      en: { foo: 'bar' },
      'es-US': { foo: 'bar_es' },
    };

    const uiStringAudioIds: UiStringAudioIdsPackage = {
      en: { foo: ['123', 'abc'] },
      'es-US': { foo: ['456', 'def'] },
      'zh-Hant': { foo: ['789', 'fff'] },
    };

    await doTestConfigure({ electionDefinition, uiStrings, uiStringAudioIds });

    expect(store.getLanguages().sort()).toEqual(['en', 'es-US'].sort());
    expect(store.getUiStringAudioIds('en')).toEqual({
      ...assertDefined(uiStringAudioIds['en']),
    });
    expect(store.getUiStringAudioIds('es-US')).toEqual({
      ...assertDefined(uiStringAudioIds['es-US']),
    });
    expect(store.getUiStringAudioIds('zh-Hant')).toBeNull();
  });

  test('is a no-op for missing uiStringAudioIds package', async () => {
    await doTestConfigure({ electionDefinition });

    expect(store.getUiStringAudioIds('en')).toBeNull();
    expect(store.getUiStringAudioIds('es-US')).toBeNull();
  });

  test('loads UI string audio clips', async () => {
    const uiStrings: UiStringsPackage = {
      en: { foo: 'bar' },
      'es-US': { foo: 'bar_es' },
    };

    const audioClipsEnglish: UiStringAudioClips = [
      { dataBase64: 'ABC==', id: 'en1', languageCode: 'en' },
      { dataBase64: 'BAC==', id: 'en2', languageCode: 'en' },
      { dataBase64: 'CAB==', id: 'dupeId', languageCode: 'en' },
    ];
    const audioClipsSpanish: UiStringAudioClips = [
      { dataBase64: 'DEF==', id: 'es1', languageCode: 'es-US' },
      { dataBase64: 'EDF==', id: 'es2', languageCode: 'es-US' },
      { dataBase64: 'FED==', id: 'dupeId', languageCode: 'es-US' },
    ];
    const audioClipsUnconfiguredLang: UiStringAudioClips = [
      {
        dataBase64: '123==',
        id: 'dupeId',
        languageCode: 'zh-Hans',
      },
    ];

    await doTestConfigure({
      electionDefinition,
      uiStrings,
      uiStringAudioClips: [
        ...audioClipsEnglish,
        ...audioClipsSpanish,
        ...audioClipsUnconfiguredLang,
      ],
    });

    function getSortedClips(input: {
      audioIds: string[];
      languageCode: string;
    }) {
      return [...store.getAudioClips(input)].sort((a, b) =>
        a.id.localeCompare(b.id)
      );
    }

    expect(
      getSortedClips({
        audioIds: ['en2', 'dupeId'],
        languageCode: 'en',
      })
    ).toEqual([
      { dataBase64: 'CAB==', id: 'dupeId', languageCode: 'en' },
      { dataBase64: 'BAC==', id: 'en2', languageCode: 'en' },
    ]);

    expect(
      getSortedClips({
        audioIds: ['es1', 'dupeId'],
        languageCode: 'es-US',
      })
    ).toEqual([
      { dataBase64: 'FED==', id: 'dupeId', languageCode: 'es-US' },
      { dataBase64: 'DEF==', id: 'es1', languageCode: 'es-US' },
    ]);

    expect(
      getSortedClips({
        audioIds: ['dupeId'],
        languageCode: 'zh-Hans',
      })
    ).toEqual([]);
  });
}
