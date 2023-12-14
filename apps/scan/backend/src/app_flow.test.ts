import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { TEST_JURISDICTION } from '@votingworks/types';
import { doesUsbDriveRequireCastVoteRecordSync } from '@votingworks/backend';
import { isReadyToScan } from './app_flow';
import { Store } from './store';
import { BALLOT_BAG_CAPACITY } from './globals';

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
    user: fakeSystemAdministratorUser(),
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
    user: fakeSystemAdministratorUser(),
    sessionExpiresAt: fakeSessionExpiresAt(),
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

  const electionManagerUser = fakeElectionManagerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
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

  const pollWorkerUser = fakePollWorkerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
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

  const electionManagerUser = fakeElectionManagerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: fakeSessionExpiresAt(),
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

  const pollWorkerUser = fakePollWorkerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: fakeSessionExpiresAt(),
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
  const electionManagerUser = fakeElectionManagerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: fakeSessionExpiresAt(),
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
  const pollWorkerUser = fakePollWorkerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: fakeSessionExpiresAt(),
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('insert_usb_drive', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();
  const pollWorkerUser = fakePollWorkerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: fakeSessionExpiresAt(),
  });

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  mockUsbDrive.removeUsbDrive();

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('replace_ballot_bag', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();
  const pollWorkerUser = fakePollWorkerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: fakeSessionExpiresAt(),
  });

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  mockUsbDrive.insertUsbDrive({});
  store.setBallotCountWhenBallotBagLastReplaced(0);
  jest.spyOn(store, 'getBallotsCounted').mockReturnValue(BALLOT_BAG_CAPACITY);

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
    })
  ).toEqual(false);
});

test('logged_in:poll_worker', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();
  const pollWorkerUser = fakePollWorkerUser({
    electionHash: electionGeneralDefinition.electionHash,
  });

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: pollWorkerUser,
    sessionExpiresAt: fakeSessionExpiresAt(),
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
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
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
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
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
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
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
