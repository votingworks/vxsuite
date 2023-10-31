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
  BALLOT_PACKAGE_FOLDER,
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
  createBallotPackageZipArchive,
  mockBallotPackageFileTree,
} from './test_utils';
import { readBallotPackageFromUsb } from './ballot_package_io';

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

test('readBallotPackageFromUsb can read a ballot package from usb', async () => {
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
    await mockBallotPackageFileTree({
      electionDefinition,
      systemSettings: safeParseSystemSettings(
        systemSettings.asText()
      ).unsafeUnwrap(),
    })
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  expect(ballotPackage.electionDefinition).toEqual(electionDefinition);
  expect(ballotPackage.systemSettings).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  expect(authenticateArtifactUsingSignatureFile).toHaveBeenCalledTimes(1);
  expect(authenticateArtifactUsingSignatureFile).toHaveBeenNthCalledWith(1, {
    type: 'election_package',
    filePath: expect.stringContaining(
      '/ballot-packages/test-ballot-package.zip'
    ),
  });
});

test("readBallotPackageFromUsb uses default system settings when system settings don't exist in the zip file", async () => {
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
    await mockBallotPackageFileTree({
      electionDefinition,
    })
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  expect(ballotPackage.electionDefinition).toEqual(electionDefinition);
  expect(ballotPackage.systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('errors if logged-out auth is passed', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_out',
    reason: 'no_card',
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockBallotPackageFileTree({ electionDefinition })
  );

  const logger = fakeLogger();

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    logger
  );
  assert(ballotPackageResult.isErr());
  expect(ballotPackageResult.err()).toEqual(
    'auth_required_before_ballot_package_load'
  );
});

test('errors if election hash on provided auth is different than ballot package election hash', async () => {
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
    await mockBallotPackageFileTree({
      electionDefinition: otherElectionDefinition,
    })
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isErr());
  expect(ballotPackageResult.err()).toEqual('election_hash_mismatch');
});

test('errors if there is no ballot package on usb drive', async () => {
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

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isErr());
  expect(ballotPackageResult.err()).toEqual('no_ballot_package_on_usb_drive');
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
    await mockBallotPackageFileTree({ electionDefinition })
  );

  await expect(
    readBallotPackageFromUsb(authStatus, mockUsbDrive.usbDrive, fakeLogger())
  ).rejects.toThrow('Only election managers may configure a ballot package.');
});

test('configures using the most recently created ballot package for an election', async () => {
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
      inactiveSessionTimeLimitMinutes: 25,
      overallSessionTimeLimitHours: 11,
      numIncorrectPinAttemptsAllowedBeforeCardLockout: 7,
    },
  };
  mockUsbDrive.insertUsbDrive({
    [electionDirectory]: {
      [BALLOT_PACKAGE_FOLDER]: {
        'older-ballot-package.zip': await createBallotPackageZipArchive(
          electionFamousNames2021Fixtures.electionJson.toBallotPackage()
        ),
        'newer-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition,
          systemSettings: specificSystemSettings,
        }),
      },
    },
  });
  await assertFilesCreatedInOrder(
    mockUsbDrive.usbDrive,
    ['older-ballot-package.zip', 'newer-ballot-package.zip'].map((filename) =>
      join(electionDirectory, BALLOT_PACKAGE_FOLDER, filename)
    )
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  // use correct system settings as a proxy for the correct ballot package
  expect(ballotPackage.systemSettings).toEqual(specificSystemSettings);
});

test('configures using the most recently created ballot package across elections', async () => {
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
      [BALLOT_PACKAGE_FOLDER]: {
        'older-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition: otherElectionDefinition,
        }),
      },
    },
    [electionDirectory]: {
      [BALLOT_PACKAGE_FOLDER]: {
        'newer-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition,
        }),
      },
    },
  });
  await assertFilesCreatedInOrder(mockUsbDrive.usbDrive, [
    join(
      otherElectionDirectory,
      BALLOT_PACKAGE_FOLDER,
      'older-ballot-package.zip'
    ),
    join(electionDirectory, BALLOT_PACKAGE_FOLDER, 'newer-ballot-package.zip'),
  ]);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  expect(ballotPackage.electionDefinition).toEqual(electionDefinition);
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
      [BALLOT_PACKAGE_FOLDER]: {
        'older-ballot-package.zip': await createBallotPackageZipArchive({
          electionDefinition,
          systemSettings: safeParseSystemSettings(
            systemSettings.asText()
          ).unsafeUnwrap(),
        }),
        '._newer-hidden-file-ballot-package.zip': Buffer.from('not a zip file'),
      },
    },
  });
  await assertFilesCreatedInOrder(
    mockUsbDrive.usbDrive,
    ['older-ballot-package.zip', '._newer-hidden-file-ballot-package.zip'].map(
      (filename) => join(electionDirectory, BALLOT_PACKAGE_FOLDER, filename)
    )
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  expect(ballotPackage.electionDefinition).toEqual(electionDefinition);
  expect(ballotPackage.systemSettings).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
});

test('readBallotPackageFromUsb returns error result if ballot package authentication errs', async () => {
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
    await mockBallotPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toBallotPackage()
    )
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  expect(ballotPackageResult).toEqual(
    err('ballot_package_authentication_error')
  );
});

test('readBallotPackageFromUsb ignores ballot package authentication errors if SKIP_BALLOT_PACKAGE_AUTHENTICATION is enabled', async () => {
  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(
    err(new Error('Whoa!'))
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_BALLOT_PACKAGE_AUTHENTICATION
  );

  const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({ electionHash }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive(
    await mockBallotPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toBallotPackage()
    )
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockUsbDrive.usbDrive,
    fakeLogger()
  );
  expect(ballotPackageResult.isOk()).toEqual(true);
});
