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
import { PrecinctScannerState, TEST_JURISDICTION } from '@votingworks/types';
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
    })
  ).toEqual(false);
});

test('setup_scanner', async () => {
  const auth = buildMockInsertedSmartCardAuth();
  const store = Store.memoryStore();
  const mockUsbDrive = createMockUsbDrive();

  store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });

  expect(
    await isReadyToScan({
      auth,
      store,
      usbDrive: mockUsbDrive.usbDrive,
      precinctScannerState: 'disconnected',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
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
      precinctScannerState: 'no_paper',
    })
  ).toEqual(false);
});

test('ballot:accepted', async () => {
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
      precinctScannerState: 'accepted',
    })
  ).toEqual(false);
});

test('ballot:accepting (no review)', async () => {
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
      precinctScannerState: 'accepting',
    })
  ).toEqual(false);
});

test('ballot:accepting (with review)', async () => {
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
      precinctScannerState: 'accepting_after_review',
    })
  ).toEqual(false);
});

test('ballot:scanning', async () => {
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
      precinctScannerState: 'scanning',
    })
  ).toEqual(false);
});

test('ballot:waiting_to_accept', async () => {
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
      precinctScannerState: 'ready_to_accept',
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
      precinctScannerState: 'ready_to_scan',
    })
  ).toEqual(true);
});

test.each([
  'connecting',
  'no_paper',
  'returning_to_rescan',
  'needs_review',
  'returning',
  'returned',
  'rejecting',
  'rejected',
  'jammed',
  'both_sides_have_paper',
  'recovering_from_error',
  'double_sheet_jammed',
  'unrecoverable_error',
] as PrecinctScannerState[])('unknown (%s)', async (precinctScannerState) => {
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
      precinctScannerState,
    })
  ).toEqual(false);
});
