import { fakeLogger } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  InsertedSmartCardAuth,
  SystemSettingsSchema,
  safeParseJson,
} from '@votingworks/types';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  electionMinimalExhaustiveSampleFixtures,
  electionFamousNames2021Fixtures,
  systemSettings,
} from '@votingworks/fixtures';
import { assert, err } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  safeParseSystemSettings,
} from '@votingworks/utils';
import {
  ArtifactAuthenticatorApi,
  buildMockArtifactAuthenticator,
} from '@votingworks/auth';
import { join } from 'path';
import * as fs from 'fs';
import { Buffer } from 'buffer';
import { createBallotPackageZipArchive } from './test_utils';
import { readBallotPackageFromUsb } from './ballot_package_io';
import { createMockUsb } from '../mock_usb';
import { UsbDrive } from '../get_usb_drives';

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

let mockArtifactAuthenticator: jest.Mocked<ArtifactAuthenticatorApi>;

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();

  mockArtifactAuthenticator = buildMockArtifactAuthenticator();
});

function assertFilesCreatedInOrder(
  usbDrive: UsbDrive,
  olderFileName: string,
  newerFileName: string
) {
  assert(usbDrive?.mountPoint !== undefined);
  // Ensure our mock actually created the files in the order we expect (the
  // order of the keys in the object above)
  const dirPath = join(usbDrive.mountPoint, 'ballot-packages');
  const files = fs.readdirSync(dirPath);
  const filesWithStats = files.map((file) => ({
    file,
    ...fs.statSync(join(dirPath, file)),
  }));
  assert(filesWithStats[0] !== undefined && filesWithStats[1] !== undefined);
  expect(filesWithStats[0].file).toContain(newerFileName);
  expect(filesWithStats[1].file).toContain(olderFileName);
  expect(filesWithStats[0].ctime.getTime()).toBeGreaterThan(
    filesWithStats[1].ctime.getTime()
  );
}

test('readBallotPackageFromUsb can read a ballot package from usb', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': await createBallotPackageZipArchive({
        electionDefinition,
        systemSettings: safeParseJson(
          systemSettings.asText(),
          SystemSettingsSchema
        ).unsafeUnwrap(),
      }),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  expect(ballotPackage.electionDefinition).toEqual(electionDefinition);
  expect(ballotPackage.systemSettings).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  expect(
    mockArtifactAuthenticator.authenticateArtifactUsingSignatureFile
  ).toHaveBeenCalledTimes(1);
  expect(
    mockArtifactAuthenticator.authenticateArtifactUsingSignatureFile
  ).toHaveBeenNthCalledWith(1, {
    type: 'ballot_package',
    path: expect.stringContaining('/ballot-packages/test-ballot-package.zip'),
  });
});

test("readBallotPackageFromUsb uses default system settings when system settings don't exist in the zip file", async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': await createBallotPackageZipArchive({
        electionDefinition,
      }),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  expect(ballotPackage.electionDefinition).toEqual(electionDefinition);
  expect(ballotPackage.systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('errors if logged-out auth is passed', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_out',
    reason: 'no_card',
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': await createBallotPackageZipArchive({
        electionDefinition,
        systemSettings: safeParseJson(
          systemSettings.asText(),
          SystemSettingsSchema
        ).unsafeUnwrap(),
      }),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const logger = fakeLogger();

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    logger
  );
  assert(ballotPackageResult.isErr());
  expect(ballotPackageResult.err()).toEqual(
    'auth_required_before_ballot_package_load'
  );
});

test('errors if election hash on provided auth is different than ballot package election hash', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { electionDefinition: otherElectionDefinition } =
    electionFamousNames2021Fixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': await createBallotPackageZipArchive({
        electionDefinition: otherElectionDefinition,
        systemSettings: safeParseJson(
          systemSettings.asText(),
          SystemSettingsSchema
        ).unsafeUnwrap(),
      }),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isErr());
  expect(ballotPackageResult.err()).toEqual('election_hash_mismatch');
});

test('errors if there is no ballot package on usb drive', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({});
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isErr());
  expect(ballotPackageResult.err()).toEqual('no_ballot_package_on_usb_drive');
});

test('errors if a user is authenticated but is not an election manager', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakePollWorkerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({});
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  await expect(
    readBallotPackageFromUsb(
      authStatus,
      mockArtifactAuthenticator,
      usbDrive,
      fakeLogger()
    )
  ).rejects.toThrow('Only election managers may configure a ballot package.');
});

test('configures using the most recently created ballot package on the usb drive', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'older-ballot-package.zip': await createBallotPackageZipArchive(
        electionFamousNames2021Fixtures.electionJson.toBallotPackage()
      ),
      'newer-ballot-package.zip': await createBallotPackageZipArchive({
        electionDefinition,
        systemSettings: safeParseJson(
          systemSettings.asText(),
          SystemSettingsSchema
        ).unsafeUnwrap(),
      }),
    },
  });
  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  assert(usbDrive);
  assertFilesCreatedInOrder(
    usbDrive,
    'older-ballot-package.zip',
    'newer-ballot-package.zip'
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    fakeLogger()
  );
  assert(ballotPackageResult.isOk());
  const ballotPackage = ballotPackageResult.ok();
  expect(ballotPackage.electionDefinition).toEqual(electionDefinition);
  expect(ballotPackage.systemSettings).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
});

test('ignores hidden `.`-prefixed files, even if they are newer', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'older-ballot-package.zip': await createBallotPackageZipArchive({
        electionDefinition,
        systemSettings: safeParseJson(
          systemSettings.asText(),
          SystemSettingsSchema
        ).unsafeUnwrap(),
      }),
      '._newer-hidden-file-ballot-package.zip': Buffer.from('not a zip file'),
    },
  });
  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  assert(usbDrive);
  assertFilesCreatedInOrder(
    usbDrive,
    'older-ballot-package.zip',
    '._newer-hidden-file-ballot-package.zip'
  );

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
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
  mockArtifactAuthenticator.authenticateArtifactUsingSignatureFile.mockResolvedValue(
    err(new Error('Whoa!'))
  );

  const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
  const authStatus: InsertedSmartCardAuth.AuthStatus = {
    status: 'logged_in',
    user: fakeElectionManagerUser({ electionHash }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'ballot-package.zip': await createBallotPackageZipArchive(
        electionFamousNames2021Fixtures.electionJson.toBallotPackage()
      ),
    },
  });
  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    fakeLogger()
  );
  expect(ballotPackageResult).toEqual(
    err('ballot_package_authentication_error')
  );
});

test('readBallotPackageFromUsb ignores ballot package authentication errors if SKIP_BALLOT_PACKAGE_AUTHENTICATION is enabled', async () => {
  mockArtifactAuthenticator.authenticateArtifactUsingSignatureFile.mockResolvedValue(
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

  const mockUsb = createMockUsb();
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'ballot-package.zip': await createBallotPackageZipArchive(
        electionFamousNames2021Fixtures.electionJson.toBallotPackage()
      ),
    },
  });
  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
    mockArtifactAuthenticator,
    usbDrive,
    fakeLogger()
  );
  expect(ballotPackageResult.isOk()).toEqual(true);
});
