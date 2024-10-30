import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { constructElectionKey, TEST_JURISDICTION } from '@votingworks/types';
import { doesUsbDriveRequireCastVoteRecordSync } from '@votingworks/backend';
import { isReadyToScan } from './app_flow';
import { Store } from './store';

const electionDefinition = electionGeneralDefinition;
const electionKey = constructElectionKey(electionDefinition.election);
const electionPackageHash = 'test-election-package-hash';

jest.mock('@votingworks/backend', () => ({
  ...jest.requireActual('@votingworks/backend'),
  doesUsbDriveRequireCastVoteRecordSync: jest.fn(),
}));

const doesUsbDriveRequireCastVoteRecordSyncMock = mockOf(
  doesUsbDriveRequireCastVoteRecordSync
);

test('setup_card_reader', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_out',
    reason: 'no_card_reader',
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('login_prompt', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('card_error', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_out',
    reason: 'card_error',
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('unlock_machine (system_administrator)', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  auth.getAuthStatus.mockResolvedValue({
    status: 'checking_pin',
    user: mockSystemAdministratorUser(),
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('logged_in:system_administrator', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('unlock_machine (election_manager)', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  const electionManagerUser = mockElectionManagerUser({ electionKey });

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'checking_pin',
    user: electionManagerUser,
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('unlock_machine (poll_worker)', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  const pollWorkerUser = mockPollWorkerUser({ electionKey });

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'checking_pin',
    user: pollWorkerUser,
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('unconfigured:election (election_manager)', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  const electionManagerUser = mockElectionManagerUser({ electionKey });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: mockSessionExpiresAt(),
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('unconfigured:election (poll_worker)', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  const pollWorkerUser = mockPollWorkerUser({ electionKey });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: mockSessionExpiresAt(),
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('logged_in:election_manager', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();
  const electionManagerUser = mockElectionManagerUser({ electionKey });

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: mockSessionExpiresAt(),
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('unconfigured:precinct', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();
  const pollWorkerUser = mockPollWorkerUser({ electionKey });

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: mockSessionExpiresAt(),
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('USB drive removed', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  mockUsbDrive.insertUsbDrive({});
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });
  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  store.transitionPolls({ type: 'open_polls', time: Date.now() });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(true);

  mockUsbDrive.removeUsbDrive();

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);

  store.setIsContinuousExportEnabled(false);

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(true);
});

test('logged_in:poll_worker', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();
  const pollWorkerUser = mockPollWorkerUser({ electionKey });

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: mockSessionExpiresAt(),
  });

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  mockUsbDrive.insertUsbDrive({});

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('polls_not_open', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  mockUsbDrive.insertUsbDrive({});

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('cast_vote_record_sync_required', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  mockUsbDrive.insertUsbDrive({});
  store.transitionPolls({ type: 'open_polls', time: Date.now() });

  doesUsbDriveRequireCastVoteRecordSyncMock.mockResolvedValue(true);

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('ballot:waiting_to_scan', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash,
  });

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  mockUsbDrive.insertUsbDrive({});
  store.transitionPolls({ type: 'open_polls', time: Date.now() });

  doesUsbDriveRequireCastVoteRecordSyncMock.mockResolvedValue(false);

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(true);
});
