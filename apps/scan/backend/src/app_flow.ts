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

/**
 * Determines whether the VxScan is ready to scan. There are circumstances when
 * there is a ballot inserted into the machine, but VxScan is not able to accept
 * it. For example, when the ballot bag is full, or when a user has logged in
 * with a smartcard.
 */
export async function isReadyToScan({
  auth,
  store,
  usbDrive,
  precinctScannerState,
}: {
  auth: InsertedSmartCardAuthApi;
  store: Store;
  usbDrive: UsbDrive;
  precinctScannerState: PrecinctScannerState;
}): Promise<boolean> {
  const authStatus = await auth.getAuthStatus(constructAuthMachineState(store));
  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return false;
  }

  const electionDefinition = store.getElectionDefinition();

  if (
    !electionDefinition &&
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card'
  ) {
    return false;
  }

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'card_error'
  ) {
    return false;
  }

  if (authStatus.status === 'logged_out' && authStatus.reason !== 'no_card') {
    return false;
  }

  if (
    authStatus.status === 'checking_pin' &&
    authStatus.user.role === 'system_administrator'
  ) {
    return false;
  }

  if (isSystemAdministratorAuth(authStatus)) {
    return false;
  }

  if (precinctScannerState === 'disconnected') {
    return false;
  }

  if (authStatus.status === 'checking_pin') {
    return false;
  }

  if (!electionDefinition) {
    return false;
  }

  if (isElectionManagerAuth(authStatus)) {
    return false;
  }

  const precinctSelection = store.getPrecinctSelection();

  if (!precinctSelection) {
    return false;
  }

  const usbDriveStatus = await usbDrive.status();
  if (usbDriveStatus.status !== 'mounted') {
    return false;
  }

  const ballotCountWhenBallotBagLastReplaced =
    store.getBallotCountWhenBallotBagLastReplaced();
  const ballotsCounted = store.getBallotsCounted();
  const needsToReplaceBallotBag =
    ballotsCounted >=
    ballotCountWhenBallotBagLastReplaced + BALLOT_BAG_CAPACITY;
  if (needsToReplaceBallotBag && precinctScannerState !== 'accepted') {
    return false;
  }

  if (isPollWorkerAuth(authStatus)) {
    return false;
  }

  // When no card is inserted, we're in "voter" mode
  assert(authStatus.status === 'logged_out' && authStatus.reason === 'no_card');

  const pollsState = store.getPollsState();
  if (pollsState !== 'polls_open') {
    return false;
  }

  if (await doesUsbDriveRequireCastVoteRecordSync(store, usbDriveStatus)) {
    return false;
  }

  return precinctScannerState === 'ready_to_scan';
}
