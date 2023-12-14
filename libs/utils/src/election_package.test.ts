import { zipFile } from '@votingworks/test-utils';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { assertDefined, typedAs } from '@votingworks/basics';
import {
  ElectionPackage,
  ElectionPackageFileName,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionStringKey,
  LanguageCode,
  SystemSettings,
  UiStringAudioIdsPackage,
  UiStringsPackage,
  safeParseElectionDefinition,
  testCdfBallotDefinition,
  UiStringAudioClips,
} from '@votingworks/types';
import { readElectionPackageFromFile } from './election_package';
import { extractCdfUiStrings } from './extract_cdf_ui_strings';

test('readElectionPackageFromFile reads an election package without system settings from a file', async () => {
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
        .electionData,
  });
  expect(
    await readElectionPackageFromFile(new File([pkg], 'election-package.zip'))
  ).toEqual(
    typedAs<ElectionPackage>({
      electionDefinition:
        electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: {},
      uiStringAudioClips: [],
    })
  );
});

test('readElectionPackageFromFile reads an election package with system settings from a file', async () => {
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
        .electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      typedAs<SystemSettings>(DEFAULT_SYSTEM_SETTINGS)
    ),
  });
  expect(
    await readElectionPackageFromFile(new File([pkg], 'election-package.zip'))
  ).toEqual(
    typedAs<ElectionPackage>({
      electionDefinition:
        electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: {},
      uiStringAudioClips: [],
    })
  );
});

test('readElectionPackageFromFile loads available ui strings', async () => {
  const appStrings: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      foo: 'bar',
      deeply: { nested: 'value' },
    },
    [LanguageCode.CHINESE_TRADITIONAL]: {
      foo: 'bar_zh',
      deeply: { nested: 'value_zh' },
    },
  };

  const testCdfElectionData = JSON.stringify(testCdfBallotDefinition);

  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: testCdfElectionData,
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify(appStrings),
  });

  const expectedElectionStrings = extractCdfUiStrings(testCdfBallotDefinition);
  const expectedUiStrings: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      ...assertDefined(appStrings[LanguageCode.ENGLISH]),
      ...assertDefined(expectedElectionStrings[LanguageCode.ENGLISH]),
    },
    [LanguageCode.CHINESE_TRADITIONAL]: {
      ...assertDefined(appStrings[LanguageCode.CHINESE_TRADITIONAL]),
    },
  };

  expect(
    await readElectionPackageFromFile(new File([pkg], 'election-package.zip'))
  ).toEqual<ElectionPackage>({
    electionDefinition:
      safeParseElectionDefinition(testCdfElectionData).unsafeUnwrap(),
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    uiStrings: expectedUiStrings,
    uiStringAudioClips: [],
  });
});

test('readElectionPackageFromFile loads vx election strings', async () => {
  const vxElectionStrings: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      [ElectionStringKey.ELECTION_DATE]: 'The Day The Earth Stood Still',
      [ElectionStringKey.ELECTION_TITLE]: 'Should be overridden by CDF string',
    },
    [LanguageCode.SPANISH]: {
      [ElectionStringKey.ELECTION_DATE]: 'El día que la Tierra se detuvo',
    },
  };

  const testCdfElectionData = JSON.stringify(testCdfBallotDefinition);
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: testCdfElectionData,
    [ElectionPackageFileName.VX_ELECTION_STRINGS]:
      JSON.stringify(vxElectionStrings),
  });

  const expectedCdfStrings = extractCdfUiStrings(testCdfBallotDefinition);
  const expectedUiStrings: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      [ElectionStringKey.ELECTION_DATE]: 'The Day The Earth Stood Still',
      ...assertDefined(expectedCdfStrings[LanguageCode.ENGLISH]),
    },
    [LanguageCode.SPANISH]: {
      [ElectionStringKey.ELECTION_DATE]: 'El día que la Tierra se detuvo',
    },
  };

  expect(
    await readElectionPackageFromFile(new File([pkg], 'election-package.zip'))
  ).toEqual<ElectionPackage>({
    electionDefinition:
      safeParseElectionDefinition(testCdfElectionData).unsafeUnwrap(),
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    uiStrings: expectedUiStrings,
    uiStringAudioClips: [],
  });
});

test('readElectionPackageFromFile loads UI string audio IDs', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { electionData } = electionDefinition;

  const audioIds: UiStringAudioIdsPackage = {
    [LanguageCode.ENGLISH]: {
      foo: ['123', 'abc'],
      deeply: { nested: ['321', 'cba'] },
    },
    [LanguageCode.CHINESE_TRADITIONAL]: {
      foo: ['456', 'def'],
      deeply: { nested: ['654', 'fed'] },
    },
  };

  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.UI_STRING_AUDIO_IDS]: JSON.stringify(audioIds),
  });

  const expectedAudioIds: UiStringAudioIdsPackage = {
    [LanguageCode.ENGLISH]: {
      ...assertDefined(audioIds[LanguageCode.ENGLISH]),
    },
    [LanguageCode.CHINESE_TRADITIONAL]: {
      ...assertDefined(audioIds[LanguageCode.CHINESE_TRADITIONAL]),
    },
  };

  expect(
    await readElectionPackageFromFile(new File([pkg], 'election-package.zip'))
  ).toEqual<ElectionPackage>({
    electionDefinition,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    uiStrings: {},
    uiStringAudioIds: expectedAudioIds,
    uiStringAudioClips: [],
  });
});

test('readElectionPackageFromFile loads UI string audio clips', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { electionData } = electionDefinition;

  const audioClips: UiStringAudioClips = [
    { dataBase64: 'AABC==', id: 'a1b2c3', languageCode: LanguageCode.ENGLISH },
    { dataBase64: 'DDEF==', id: 'd1e2f3', languageCode: LanguageCode.SPANISH },
  ];

  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.AUDIO_CLIPS]: audioClips
      .map((clip) => JSON.stringify(clip))
      .join('\n'),
  });

  expect(
    await readElectionPackageFromFile(new File([pkg], 'election-package.zip'))
  ).toEqual<ElectionPackage>({
    electionDefinition,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    uiStrings: {},
    uiStringAudioClips: audioClips,
  });
});

test('readElectionPackageFromFile throws when an election.json is not present', async () => {
  const pkg = await zipFile({});
  await expect(
    readElectionPackageFromFile(new File([pkg], 'election-package.zip'))
  ).rejects.toThrowError(
    "election package does not have a file called 'election.json'"
  );
});

test('readElectionPackageFromFile throws when given an invalid zip file', async () => {
  await expect(
    readElectionPackageFromFile(new File(['not-a-zip'], 'election-package.zip'))
  ).rejects.toThrowError();
});

test('readElectionPackageFromFile throws when the file cannot be read', async () => {
  await expect(
    readElectionPackageFromFile({} as unknown as File)
  ).rejects.toThrowError();
});
