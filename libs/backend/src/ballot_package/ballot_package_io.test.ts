import { fakeLogger } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  InsertedSmartCardAuth,
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
import { assert } from '@votingworks/basics';
import { safeParseSystemSettings } from '@votingworks/utils';
import { join } from 'path';
import * as fsSync from 'fs';
import { Buffer } from 'buffer';
import { createBallotPackageWithoutTemplates } from './test_utils';
import { readBallotPackageFromUsb } from './ballot_package_io';
import { createMockUsb } from '../mock_usb';
import { UsbDrive } from '../get_usb_drives';

function assertFilesCreatedInOrder(
  usbDrive: UsbDrive,
  olderFileName: string,
  newerFileName: string
) {
  assert(usbDrive?.mountPoint !== undefined);
  // Ensure our mock actually created the files in the order we expect (the
  // order of the keys in the object above)
  const dirPath = join(usbDrive.mountPoint, 'ballot-packages');
  const files = fsSync.readdirSync(dirPath);
  const filesWithStats = files.map((file) => ({
    file,
    ...fsSync.statSync(join(dirPath, file)),
  }));
  assert(filesWithStats[0] !== undefined && filesWithStats[1] !== undefined);
  expect(filesWithStats[0].file).toContain(newerFileName);
  expect(filesWithStats[1].file).toContain(olderFileName);
  // expect(filesWithStats[0].file).toContain('newer-ballot-package.zip');
  // expect(filesWithStats[1].file).toContain('older-ballot-package.zip');
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
      'test-ballot-package.zip': createBallotPackageWithoutTemplates(
        electionDefinition,
        { systemSettingsString: systemSettings.asText() }
      ),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
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
      'test-ballot-package.zip': createBallotPackageWithoutTemplates(
        electionDefinition,
        { omitSystemSettings: true }
      ),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
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
      'test-ballot-package.zip': createBallotPackageWithoutTemplates(
        electionDefinition,
        { systemSettingsString: systemSettings.asText() }
      ),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const logger = fakeLogger();

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
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
      'test-ballot-package.zip': createBallotPackageWithoutTemplates(
        otherElectionDefinition,
        { systemSettingsString: systemSettings.asText() }
      ),
    },
  });
  const usbDrives = await mockUsb.mock.getUsbDrives();
  const usbDrive = usbDrives[0];
  assert(usbDrive);

  const ballotPackageResult = await readBallotPackageFromUsb(
    authStatus,
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
    readBallotPackageFromUsb(authStatus, usbDrive, fakeLogger())
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
      'older-ballot-package.zip':
        electionFamousNames2021Fixtures.ballotPackage.asBuffer(),
      'newer-ballot-package.zip': createBallotPackageWithoutTemplates(
        electionDefinition,
        { systemSettingsString: systemSettings.asText() }
      ),
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

test('ignores hidden `._`-prefixed files, even if they are newer', async () => {
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
      'older-ballot-package.zip': createBallotPackageWithoutTemplates(
        electionDefinition,
        { systemSettingsString: systemSettings.asText() }
      ),
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
