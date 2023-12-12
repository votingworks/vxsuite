import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { doesUsbDriveRequireCastVoteRecordSync } from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import { PrecinctScannerState } from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import {
  isElectionManagerAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { BALLOT_BAG_CAPACITY } from './globals';
import { Store } from './store';
import { constructAuthMachineState } from './util/construct_auth_machine_state';
import { AppFlowState } from './types';

export async function getCurrentAppFlowState({
  auth,
  store,
  usbDrive,
  precinctScannerState,
}: {
  auth: InsertedSmartCardAuthApi;
  store: Store;
  usbDrive: UsbDrive;
  precinctScannerState: PrecinctScannerState;
}): Promise<AppFlowState> {
  const authStatus = await auth.getAuthStatus(constructAuthMachineState(store));
  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return 'setup_card_reader';
  }

  const electionDefinition = store.getElectionDefinition();

  if (
    !electionDefinition &&
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card'
  ) {
    return 'login_prompt';
  }

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'card_error'
  ) {
    return 'card_error';
  }

  if (authStatus.status === 'logged_out' && authStatus.reason !== 'no_card') {
    return 'invalid_card';
  }

  if (
    authStatus.status === 'checking_pin' &&
    authStatus.user.role === 'system_administrator'
  ) {
    return 'unlock_machine';
  }

  if (isSystemAdministratorAuth(authStatus)) {
    return 'logged_in:system_administrator';
  }

  if (precinctScannerState === 'disconnected') {
    return 'setup_scanner';
  }

  if (authStatus.status === 'checking_pin') {
    return 'unlock_machine';
  }

  if (!electionDefinition) {
    return 'unconfigured:election';
  }

  if (isElectionManagerAuth(authStatus)) {
    return 'logged_in:election_manager';
  }

  const precinctSelection = store.getPrecinctSelection();

  if (!precinctSelection) {
    return 'unconfigured:precinct';
  }

  const usbDriveStatus = await usbDrive.status();
  if (usbDriveStatus.status !== 'mounted') {
    return 'insert_usb_drive';
  }

  const ballotCountWhenBallotBagLastReplaced =
    store.getBallotCountWhenBallotBagLastReplaced();
  const ballotsCounted = store.getBallotsCounted();
  const needsToReplaceBallotBag =
    ballotsCounted >=
    ballotCountWhenBallotBagLastReplaced + BALLOT_BAG_CAPACITY;
  if (needsToReplaceBallotBag && precinctScannerState !== 'accepted') {
    return 'replace_ballot_bag';
  }

  if (isPollWorkerAuth(authStatus)) {
    return 'logged_in:poll_worker';
  }

  // When no card is inserted, we're in "voter" mode
  assert(authStatus.status === 'logged_out' && authStatus.reason === 'no_card');

  const pollsState = store.getPollsState();
  if (pollsState !== 'polls_open') {
    return 'polls_not_open';
  }

  if (await doesUsbDriveRequireCastVoteRecordSync(store, usbDriveStatus)) {
    return 'cast_vote_record_sync_required';
  }

  switch (precinctScannerState) {
    case 'accepted':
      return 'ballot:accepted';

    case 'accepting':
    case 'accepting_after_review':
      return 'ballot:accepting';

    case 'scanning':
      return 'ballot:scanning';

    case 'ready_to_accept':
      return 'ballot:waiting_to_accept';

    default:
      return 'ballot:waiting_to_scan';
  }
}
