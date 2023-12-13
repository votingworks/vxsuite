/* istanbul ignore file - test util */

import {
  ElectionPackage,
  ExtendedElectionDefinition,
  LanguageCode,
  UiStringAudioClips,
  UiStringAudioIdsPackage,
  UiStringsPackage,
} from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { extractCdfUiStrings } from '@votingworks/utils';
import { Result, assertDefined } from '@votingworks/basics';
import { UiStringsStore } from './ui_strings_store';
import { mockElectionPackageFileTree } from '../election_package/test_utils';

type MockUsbDriveLike = Pick<MockUsbDrive, 'insertUsbDrive'>;

/** Test context for {@link runUiStringMachineConfigurationTests}. */
export interface UiStringConfigTestContext {
  electionPackage: ExtendedElectionDefinition;
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
  const { electionPackage, getMockUsbDrive, runConfigureMachine, store } =
    context;
  const { cdfElection, electionDefinition } = electionPackage;
  const expectedElectionStrings = extractCdfUiStrings(
    assertDefined(cdfElection)
  );

  async function doTestConfigure(usbElectionPackage: ElectionPackage) {
    getMockUsbDrive().insertUsbDrive(
      await mockElectionPackageFileTree(usbElectionPackage)
    );

    const result = await runConfigureMachine();
    expect(result.err()).toBeUndefined();
  }

  test('loads all available UI strings', async () => {
    const appStrings: UiStringsPackage = {
      [LanguageCode.ENGLISH]: { foo: 'bar', deeply: { nested: 'value' } },
      [LanguageCode.SPANISH]: { foo: 'bar_es', deeply: { nested: 'value_es' } },
    };

    await doTestConfigure({ electionDefinition, uiStrings: appStrings });

    expect(store.getLanguages().sort()).toEqual(
      [LanguageCode.ENGLISH, LanguageCode.SPANISH].sort()
    );
    expect(store.getUiStrings(LanguageCode.ENGLISH)).toEqual({
      ...assertDefined(appStrings[LanguageCode.ENGLISH]),
      ...assertDefined(expectedElectionStrings[LanguageCode.ENGLISH]),
    });
    expect(store.getUiStrings(LanguageCode.SPANISH)).toEqual(
      appStrings[LanguageCode.SPANISH]
    );
    expect(store.getUiStrings(LanguageCode.CHINESE_TRADITIONAL)).toBeNull();
  });

  test('is a no-op for missing uiStrings package', async () => {
    await doTestConfigure({ electionDefinition });

    expect(store.getLanguages()).toEqual([LanguageCode.ENGLISH]);
    expect(store.getUiStrings(LanguageCode.ENGLISH)).toEqual(
      expectedElectionStrings[LanguageCode.ENGLISH]
    );
    expect(store.getUiStrings(LanguageCode.SPANISH)).toBeNull();
  });

  test('loads UI string audio IDs for configured languages', async () => {
    const uiStrings: UiStringsPackage = {
      [LanguageCode.ENGLISH]: { foo: 'bar' },
      [LanguageCode.SPANISH]: { foo: 'bar_es' },
    };

    const uiStringAudioIds: UiStringAudioIdsPackage = {
      [LanguageCode.ENGLISH]: { foo: ['123', 'abc'] },
      [LanguageCode.SPANISH]: { foo: ['456', 'def'] },
      [LanguageCode.CHINESE_TRADITIONAL]: { foo: ['789', 'fff'] },
    };

    await doTestConfigure({ electionDefinition, uiStrings, uiStringAudioIds });

    expect(store.getLanguages().sort()).toEqual(
      [LanguageCode.ENGLISH, LanguageCode.SPANISH].sort()
    );
    expect(store.getUiStringAudioIds(LanguageCode.ENGLISH)).toEqual({
      ...assertDefined(uiStringAudioIds[LanguageCode.ENGLISH]),
    });
    expect(store.getUiStringAudioIds(LanguageCode.SPANISH)).toEqual({
      ...assertDefined(uiStringAudioIds[LanguageCode.SPANISH]),
    });
    expect(
      store.getUiStringAudioIds(LanguageCode.CHINESE_TRADITIONAL)
    ).toBeNull();
  });

  test('is a no-op for missing uiStringAudioIds package', async () => {
    await doTestConfigure({ electionDefinition });

    expect(store.getUiStringAudioIds(LanguageCode.ENGLISH)).toBeNull();
    expect(store.getUiStringAudioIds(LanguageCode.SPANISH)).toBeNull();
  });

  test('loads UI string audio clips', async () => {
    const uiStrings: UiStringsPackage = {
      [LanguageCode.ENGLISH]: { foo: 'bar' },
      [LanguageCode.SPANISH]: { foo: 'bar_es' },
    };

    const audioClipsEnglish: UiStringAudioClips = [
      { dataBase64: 'ABC==', id: 'en1', languageCode: LanguageCode.ENGLISH },
      { dataBase64: 'BAC==', id: 'en2', languageCode: LanguageCode.ENGLISH },
      { dataBase64: 'CAB==', id: 'dupeId', languageCode: LanguageCode.ENGLISH },
    ];
    const audioClipsSpanish: UiStringAudioClips = [
      { dataBase64: 'DEF==', id: 'es1', languageCode: LanguageCode.SPANISH },
      { dataBase64: 'EDF==', id: 'es2', languageCode: LanguageCode.SPANISH },
      { dataBase64: 'FED==', id: 'dupeId', languageCode: LanguageCode.SPANISH },
    ];
    const audioClipsUnconfiguredLang: UiStringAudioClips = [
      {
        dataBase64: '123==',
        id: 'dupeId',
        languageCode: LanguageCode.CHINESE_SIMPLIFIED,
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
      languageCode: LanguageCode;
    }) {
      return [...store.getAudioClips(input)].sort((a, b) =>
        a.id.localeCompare(b.id)
      );
    }

    expect(
      getSortedClips({
        audioIds: ['en2', 'dupeId'],
        languageCode: LanguageCode.ENGLISH,
      })
    ).toEqual([
      { dataBase64: 'CAB==', id: 'dupeId', languageCode: LanguageCode.ENGLISH },
      { dataBase64: 'BAC==', id: 'en2', languageCode: LanguageCode.ENGLISH },
    ]);

    expect(
      getSortedClips({
        audioIds: ['es1', 'dupeId'],
        languageCode: LanguageCode.SPANISH,
      })
    ).toEqual([
      { dataBase64: 'FED==', id: 'dupeId', languageCode: LanguageCode.SPANISH },
      { dataBase64: 'DEF==', id: 'es1', languageCode: LanguageCode.SPANISH },
    ]);

    expect(
      getSortedClips({
        audioIds: ['dupeId'],
        languageCode: LanguageCode.CHINESE_SIMPLIFIED,
      })
    ).toEqual([]);
  });
}
