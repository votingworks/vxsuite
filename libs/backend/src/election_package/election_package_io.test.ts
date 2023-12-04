import { fakeLogger } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  InsertedSmartCardAuth,
  SystemSettings,
  safeParseSystemSettings,
} from '@votingworks/types';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  electionTwoPartyPrimaryFixtures,
  electionFamousNames2021Fixtures,
  systemSettings,
} from '@votingworks/fixtures';
import { assert, err, ok } from '@votingworks/basics';
import {
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  generateElectionBasedSubfolderName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { join } from 'path';
import * as fs from 'fs';
import { Buffer } from 'buffer';
import { UsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import {
  createElectionPackageZipArchive,
  mockElectionPackageFileTree,
} from './test_utils';
import { readElectionPackageFromUsb } from './election_package_io';

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

test('readElectionPackageFromUsb can read an election package from usb', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
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

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(electionPackageResult.isOk());
  const electionPackage = electionPackageResult.ok();
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
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
    })
  );

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(electionPackageResult.isOk());
  const electionPackage = electionPackageResult.ok();
  expect(electionPackage.electionDefinition).toEqual(electionDefinition);
  expect(electionPackage.systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('errors if logged-out auth is passed', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_out',
    reason: 'no_card',
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({ electionDefinition })
  );

  const logger = fakeLogger();

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    logger
  );
  assert(electionPackageResult.isErr());
  expect(electionPackageResult.err()).toEqual(
    'auth_required_before_election_package_load'
  );
});

test('errors if election hash on provided auth is different than election package election hash', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionDefinition: otherElectionDefinition } =
    electionFamousNames2021Fixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition: otherElectionDefinition,
    })
  );

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(electionPackageResult.isErr());
  expect(electionPackageResult.err()).toEqual('election_hash_mismatch');
});

test('errors if there is no election package on usb drive', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(electionPackageResult.isErr());
  expect(electionPackageResult.err()).toEqual(
    'no_election_package_on_usb_drive'
  );
});

test('errors if a user is authenticated but is not an election manager', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakePollWorkerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({ electionDefinition })
  );

  await expect(
    readElectionPackageFromUsb(authStatus, mockUsbDrive.usbDrive, fakeLogger())
  ).rejects.toThrow(
    'Only election managers may configure an election package.'
  );
});

test('configures using the most recently created election package for an election', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { election, electionHash } = electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    electionHash
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

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(electionPackageResult.isOk());
  const electionPackage = electionPackageResult.ok();
  // use correct system settings as a proxy for the correct election package
  expect(electionPackage.systemSettings).toEqual(specificSystemSettings);
});

test('configures using the most recently created election package across elections', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { election, electionHash } = electionDefinition;

  const { electionDefinition: otherElectionDefinition } =
    electionFamousNames2021Fixtures;
  const { election: otherElection, electionHash: otherElectionHash } =
    otherElectionDefinition;

  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    electionHash
  );
  const otherElectionDirectory = generateElectionBasedSubfolderName(
    otherElection,
    otherElectionHash
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

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(electionPackageResult.isOk());
  const electionPackage = electionPackageResult.ok();
  expect(electionPackage.electionDefinition).toEqual(electionDefinition);
});

test('ignores hidden `.`-prefixed files, even if they are newer', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { election, electionHash } = electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    electionHash
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

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(electionPackageResult.isOk());
  const electionPackage = electionPackageResult.ok();
  expect(electionPackage.electionDefinition).toEqual(electionDefinition);
  expect(electionPackage.systemSettings).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
});

test('readElectionPackageFromUsb returns error result if election package authentication errs', async () => {
  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(
    err(new Error('Whoa!'))
  );

  const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({ electionHash }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
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

  const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({ electionHash }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );

  const electionPackageResult = await readElectionPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  expect(electionPackageResult.isOk()).toEqual(true);
});
