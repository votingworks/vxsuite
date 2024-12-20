import { mockBaseLogger } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  InsertedSmartCardAuth,
  LATEST_METADATA,
  SystemSettings,
  UiStringAudioClips,
  UiStringAudioIdsPackage,
  UiStringsPackage,
  constructElectionKey,
  safeParseElection,
  safeParseElectionDefinition,
  safeParseSystemSettings,
  testCdfBallotDefinition,
} from '@votingworks/types';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockOf,
  zipFile,
} from '@votingworks/test-utils';
import {
  electionTwoPartyPrimaryFixtures,
  electionFamousNames2021Fixtures,
  systemSettings,
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { assert, assertDefined, err, ok, typedAs } from '@votingworks/basics';
import {
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  generateElectionBasedSubfolderName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { join } from 'node:path';
import * as fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { UsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { tmpNameSync } from 'tmp';
import { sha256 } from 'js-sha256';
import {
  createElectionPackageZipArchive,
  mockElectionPackageFileTree,
} from './test_utils';
import {
  ElectionPackageWithFileContents,
  readElectionPackageFromFile,
  readSignedElectionPackageFromUsb,
} from './election_package_io';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/auth', (): typeof import('@votingworks/auth') => ({
  ...jest.requireActual('@votingworks/auth'),
  authenticateArtifactUsingSignatureFile: jest.fn(),
}));

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(ok());
  mockFeatureFlagger.resetFeatureFlags();
});

async function assertFilesCreatedInOrder(
  usbDrive: UsbDrive,
  relativeFilePaths: string[]
) {
  const usbDriveStatus = await usbDrive.status();
  assert(usbDriveStatus.status === 'mounted');
  // Ensure our mock actually created the files in the order we expect (the
  // order of the keys in the object above)
  const filesWithStats = relativeFilePaths.map((relativeFilePath) =>
    fs.statSync(join(usbDriveStatus.mountPoint, relativeFilePath))
  );
  for (let i = 0; i < filesWithStats.length - 1; i += 1) {
    expect(filesWithStats[i]!.ctime.getTime()).toBeLessThan(
      filesWithStats[i + 1]!.ctime.getTime()
    );
  }
}

function saveTmpFile(contents: Buffer) {
  const tmpFile = tmpNameSync();
  fs.writeFileSync(tmpFile, contents);
  return tmpFile;
}

test('readElectionPackageFromFile reads an election package without system settings from a file', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
  });
  const file = saveTmpFile(pkg);
  const fileContents = fs.readFileSync(file);
  expect(
    (await readElectionPackageFromFile(file)).unsafeUnwrap()
  ).toEqual<ElectionPackageWithFileContents>({
    electionPackage: {
      electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: electionDefinition.election.ballotStrings,
      uiStringAudioClips: [],
    },
    electionPackageHash: sha256(fileContents),
    fileContents,
  });
});

test('readElectionPackageFromFile reads an election package with system settings from a file', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      typedAs<SystemSettings>(DEFAULT_SYSTEM_SETTINGS)
    ),
  });
  const file = saveTmpFile(pkg);
  const fileContents = fs.readFileSync(file);
  expect(
    (await readElectionPackageFromFile(file)).unsafeUnwrap()
  ).toEqual<ElectionPackageWithFileContents>({
    electionPackage: {
      electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: electionDefinition.election.ballotStrings,
      uiStringAudioClips: [],
    },
    electionPackageHash: sha256(fileContents),
    fileContents,
  });
});

test('readElectionPackageFromFile loads available ui strings', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  const appStrings: UiStringsPackage = {
    en: {
      foo: 'bar',
      deeply: { nested: 'value' },
    },
    'zh-Hant': {
      foo: 'bar_zh',
      deeply: { nested: 'value_zh' },
    },
  };

  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify(appStrings),
  });
  const file = saveTmpFile(pkg);

  const expectedElectionStrings = electionDefinition.election.ballotStrings;
  const expectedUiStrings: UiStringsPackage = {
    en: {
      ...assertDefined(appStrings['en']),
      ...assertDefined(expectedElectionStrings['en']),
    },
    'zh-Hans': {
      ...assertDefined(expectedElectionStrings['zh-Hans']),
    },
    'zh-Hant': {
      ...assertDefined(appStrings['zh-Hant']),
      ...assertDefined(expectedElectionStrings['zh-Hant']),
    },
    'es-US': {
      ...assertDefined(expectedElectionStrings['es-US']),
    },
  };

  expect(
    (await readElectionPackageFromFile(file)).unsafeUnwrap()
  ).toEqual<ElectionPackageWithFileContents>({
    electionPackage: {
      electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: expectedUiStrings,
      uiStringAudioClips: [],
    },
    electionPackageHash: expect.any(String),
    fileContents: expect.any(Buffer),
  });
});

test('readElectionPackageFromFile loads election strings from CDF', async () => {
  const testCdfElectionData = JSON.stringify(testCdfBallotDefinition);
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: testCdfElectionData,
  });
  const file = saveTmpFile(pkg);

  const expectedCdfStrings = safeParseElection(
    testCdfBallotDefinition
  ).unsafeUnwrap().ballotStrings;
  expect(
    (await readElectionPackageFromFile(file)).unsafeUnwrap()
  ).toEqual<ElectionPackageWithFileContents>({
    electionPackage: {
      electionDefinition:
        safeParseElectionDefinition(testCdfElectionData).unsafeUnwrap(),
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: expectedCdfStrings,
      uiStringAudioClips: [],
    },
    electionPackageHash: expect.any(String),
    fileContents: expect.any(Buffer),
  });
});

test('readElectionPackageFromFile loads UI string audio IDs', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { electionData } = electionDefinition;

  const audioIds: UiStringAudioIdsPackage = {
    en: {
      foo: ['123', 'abc'],
      deeply: { nested: ['321', 'cba'] },
    },
    'zh-Hant': {
      foo: ['456', 'def'],
      deeply: { nested: ['654', 'fed'] },
    },
  };

  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.AUDIO_IDS]: JSON.stringify(audioIds),
  });
  const file = saveTmpFile(pkg);

  const expectedAudioIds: UiStringAudioIdsPackage = {
    en: {
      ...assertDefined(audioIds['en']),
    },
    'zh-Hant': {
      ...assertDefined(audioIds['zh-Hant']),
    },
  };

  expect(
    (await readElectionPackageFromFile(file)).unsafeUnwrap()
  ).toEqual<ElectionPackageWithFileContents>({
    electionPackage: {
      electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: electionDefinition.election.ballotStrings,
      uiStringAudioIds: expectedAudioIds,
      uiStringAudioClips: [],
    },
    electionPackageHash: expect.any(String),
    fileContents: expect.any(Buffer),
  });
});

test('readElectionPackageFromFile loads UI string audio clips', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { electionData } = electionDefinition;

  const audioClips: UiStringAudioClips = [
    { dataBase64: 'AABC==', id: 'a1b2c3', languageCode: 'en' },
    { dataBase64: 'DDEF==', id: 'd1e2f3', languageCode: 'es-US' },
  ];

  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.AUDIO_CLIPS]: audioClips
      .map((clip) => JSON.stringify(clip))
      .join('\n'),
  });
  const file = saveTmpFile(pkg);

  expect(
    (await readElectionPackageFromFile(file)).unsafeUnwrap()
  ).toEqual<ElectionPackageWithFileContents>({
    electionPackage: {
      electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStrings: electionDefinition.election.ballotStrings,
      uiStringAudioClips: audioClips,
    },
    electionPackageHash: expect.any(String),
    fileContents: expect.any(Buffer),
  });
});

test('readElectionPackageFromFile reads metadata', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { electionData } = electionDefinition;
  const metadata: ElectionPackageMetadata = LATEST_METADATA;

  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(metadata),
  });
  const file = saveTmpFile(pkg);

  expect(
    (await readElectionPackageFromFile(file)).unsafeUnwrap()
  ).toEqual<ElectionPackageWithFileContents>({
    electionPackage: {
      electionDefinition,
      metadata,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      uiStringAudioClips: [],
      uiStrings: electionDefinition.election.ballotStrings,
    },
    electionPackageHash: expect.any(String),
    fileContents: expect.any(Buffer),
  });
});

test('readElectionPackageFromFile errors when an election.json is not present', async () => {
  const pkg = await zipFile({});
  const file = saveTmpFile(pkg);
  expect(await readElectionPackageFromFile(file)).toEqual(
    err({
      type: 'invalid-zip',
      message:
        "Error: election package does not have a file called 'election.json'",
    })
  );
});

test('readElectionPackageFromFile errors throws when given an invalid zip file', async () => {
  const file = saveTmpFile(Buffer.from('not a zip file'));
  expect(await readElectionPackageFromFile(file)).toEqual(
    err({
      type: 'invalid-zip',
      message:
        "Error: Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html",
    })
  );
});

test('readElectionPackageFromFile errors when given an invalid election', async () => {
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]: 'not a valid election',
  });
  const file = saveTmpFile(pkg);

  expect(await readElectionPackageFromFile(file)).toEqual(
    err({
      type: 'invalid-election',
      message: expect.stringMatching(/JSON/i),
    })
  );
});

test('readElectionPackageFromFile errors when given invalid system settings', async () => {
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]:
      electionGridLayoutNewHampshireTestBallotFixtures.electionJson.asText(),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: 'not a valid system settings',
  });
  const file = saveTmpFile(pkg);

  expect(await readElectionPackageFromFile(file)).toEqual(
    err({
      type: 'invalid-system-settings',
      message: expect.stringMatching(/JSON/i),
    })
  );
});

test('readElectionPackageFromFile errors when given invalid metadata', async () => {
  const pkg = await zipFile({
    [ElectionPackageFileName.ELECTION]:
      electionGridLayoutNewHampshireTestBallotFixtures.electionJson.asText(),
    [ElectionPackageFileName.METADATA]: 'asdf',
  });
  const file = saveTmpFile(pkg);

  expect(await readElectionPackageFromFile(file)).toEqual(
    err({
      type: 'invalid-metadata',
      message: expect.stringMatching(/JSON/i),
    })
  );
});

test('readElectionPackageFromUsb can read an election package from usb', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const electionKey = constructElectionKey(election);
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseSystemSettings(
        systemSettings.asText()
      ).unsafeUnwrap(),
    })
  );

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  assert(electionPackageResult.isOk());
  const { electionPackage } = electionPackageResult.ok();
  expect(electionPackage.electionDefinition).toEqual(electionDefinition);
  expect(electionPackage.systemSettings).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  expect(authenticateArtifactUsingSignatureFile).toHaveBeenCalledTimes(1);
  expect(authenticateArtifactUsingSignatureFile).toHaveBeenNthCalledWith(1, {
    type: 'election_package',
    filePath: expect.stringContaining(
      '/election-packages/test-election-package.zip'
    ),
  });
});

test("readElectionPackageFromUsb uses default system settings when system settings don't exist in the zip file", async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
    })
  );

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  assert(electionPackageResult.isOk());
  const { electionPackage } = electionPackageResult.ok();
  expect(electionPackage.electionDefinition).toEqual(electionDefinition);
  expect(electionPackage.systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('errors if logged-out auth is passed', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_out',
    reason: 'no_card',
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({ electionDefinition })
  );

  const logger = mockBaseLogger({ fn: jest.fn });

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    logger
  );
  assert(electionPackageResult.isErr());
  expect(electionPackageResult.err()).toEqual(
    'auth_required_before_election_package_load'
  );
});

test('errors if election key on provided auth is different than election package election key', async () => {
  const election = electionTwoPartyPrimaryFixtures.readElection();
  const otherElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition: otherElectionDefinition,
    })
  );

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  assert(electionPackageResult.isErr());
  expect(electionPackageResult.err()).toEqual('election_key_mismatch');
});

test('errors if there is no election package on usb drive', async () => {
  const election = electionTwoPartyPrimaryFixtures.readElection();
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  assert(electionPackageResult.isErr());
  expect(electionPackageResult.err()).toEqual(
    'no_election_package_on_usb_drive'
  );
});

test('errors if a user is authenticated but is not an election manager', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockPollWorkerUser({ electionKey: constructElectionKey(election) }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({ electionDefinition })
  );

  await expect(
    readSignedElectionPackageFromUsb(
      authStatus,
      mockUsbDrive.usbDrive,
      mockBaseLogger({ fn: jest.fn })
    )
  ).rejects.toThrow(
    'Only election managers may configure an election package.'
  );
});

test('configures using the most recently created election package for an election', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    ballotHash
  );
  const specificSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    auth: {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      inactiveSessionTimeLimitMinutes: 20,
      overallSessionTimeLimitHours: 11,
      numIncorrectPinAttemptsAllowedBeforeCardLockout: 7,
    },
  };
  mockUsbDrive.insertUsbDrive({
    [electionDirectory]: {
      [ELECTION_PACKAGE_FOLDER]: {
        'older-election-package.zip': await createElectionPackageZipArchive(
          electionFamousNames2021Fixtures.electionJson.toElectionPackage()
        ),
        'newer-election-package.zip': await createElectionPackageZipArchive({
          electionDefinition,
          systemSettings: specificSystemSettings,
        }),
      },
    },
  });
  await assertFilesCreatedInOrder(
    mockUsbDrive.usbDrive,
    ['older-election-package.zip', 'newer-election-package.zip'].map(
      (filename) => join(electionDirectory, ELECTION_PACKAGE_FOLDER, filename)
    )
  );

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  assert(electionPackageResult.isOk());
  const { electionPackage } = electionPackageResult.ok();
  // use correct system settings as a proxy for the correct election package
  expect(electionPackage.systemSettings).toEqual(specificSystemSettings);
});

test('configures using the most recently created election package across elections', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election, ballotHash } = electionDefinition;

  const otherElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election: otherElection, ballotHash: otherBallotHash } =
    otherElectionDefinition;

  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    ballotHash
  );
  const otherElectionDirectory = generateElectionBasedSubfolderName(
    otherElection,
    otherBallotHash
  );
  mockUsbDrive.insertUsbDrive({
    [otherElectionDirectory]: {
      [ELECTION_PACKAGE_FOLDER]: {
        'older-election-package.zip': await createElectionPackageZipArchive({
          electionDefinition: otherElectionDefinition,
        }),
      },
    },
    [electionDirectory]: {
      [ELECTION_PACKAGE_FOLDER]: {
        'newer-election-package.zip': await createElectionPackageZipArchive({
          electionDefinition,
        }),
      },
    },
  });
  await assertFilesCreatedInOrder(mockUsbDrive.usbDrive, [
    join(
      otherElectionDirectory,
      ELECTION_PACKAGE_FOLDER,
      'older-election-package.zip'
    ),
    join(
      electionDirectory,
      ELECTION_PACKAGE_FOLDER,
      'newer-election-package.zip'
    ),
  ]);

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  assert(electionPackageResult.isOk());
  const { electionPackage } = electionPackageResult.ok();
  expect(electionPackage.electionDefinition).toEqual(electionDefinition);
});

test('ignores hidden `.`-prefixed files, even if they are newer', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    ballotHash
  );
  mockUsbDrive.insertUsbDrive({
    [electionDirectory]: {
      [ELECTION_PACKAGE_FOLDER]: {
        'older-election-package.zip': await createElectionPackageZipArchive({
          electionDefinition,
          systemSettings: safeParseSystemSettings(
            systemSettings.asText()
          ).unsafeUnwrap(),
        }),
        '._newer-hidden-file-election-package.zip':
          Buffer.from('not a zip file'),
      },
    },
  });
  await assertFilesCreatedInOrder(
    mockUsbDrive.usbDrive,
    [
      'older-election-package.zip',
      '._newer-hidden-file-election-package.zip',
    ].map((filename) =>
      join(electionDirectory, ELECTION_PACKAGE_FOLDER, filename)
    )
  );

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  assert(electionPackageResult.isOk());
  const { electionPackage } = electionPackageResult.ok();
  expect(electionPackage.electionDefinition).toEqual(electionDefinition);
  expect(electionPackage.systemSettings).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
});

test('readElectionPackageFromUsb returns error result if election package authentication errs', async () => {
  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(
    err(new Error('Whoa!'))
  );

  const electionKey = constructElectionKey(
    electionFamousNames2021Fixtures.readElection()
  );
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  expect(electionPackageResult).toEqual(
    err('election_package_authentication_error')
  );
});

test('readElectionPackageFromUsb ignores election package authentication errors if SKIP_ELECTION_PACKAGE_AUTHENTICATION is enabled', async () => {
  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(
    err(new Error('Whoa!'))
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  const electionKey = constructElectionKey(
    electionFamousNames2021Fixtures.readElection()
  );
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );

  const electionPackageResult = await readSignedElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    mockBaseLogger({ fn: jest.fn })
  );
  expect(electionPackageResult.isOk()).toEqual(true);
});
