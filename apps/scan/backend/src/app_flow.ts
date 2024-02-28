import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { doesUsbDriveRequireCastVoteRecordSync } from '@votingworks/backend';
import { UsbDrive } from '@votingworks/usb-drive';
import { BALLOT_BAG_CAPACITY } from './globals';
import { Store } from './store';
import { constructAuthMachineState } from './util/auth';

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
}: {
  auth: InsertedSmartCardAuthApi;
  store: Store;
  usbDrive: UsbDrive;
}): Promise<boolean> {
  const authStatus = await auth.getAuthStatus(constructAuthMachineState(store));

  // The voter screen has no associated card and is therefore `logged_out`.
  if (authStatus.status !== 'logged_out' || authStatus.reason !== 'no_card') {
    return false;
  }

  const electionDefinition = store.getElectionDefinition();

  // If there is no election definition, we can't scan.
  if (!electionDefinition) {
    return false;
  }

  const precinctSelection = store.getPrecinctSelection();

  // If there is no precinct selection, we can't scan.
  if (!precinctSelection) {
    return false;
  }

  const pollsState = store.getPollsState();

  // If the polls are not open, we can't scan.
  if (pollsState !== 'polls_open') {
    return false;
  }

  const ballotCountWhenBallotBagLastReplaced =
    store.getBallotCountWhenBallotBagLastReplaced();
  const ballotsCounted = store.getBallotsCounted();
  const needsToReplaceBallotBag =
    ballotsCounted >=
    ballotCountWhenBallotBagLastReplaced + BALLOT_BAG_CAPACITY;

  // If the ballot bag is full, we can't scan.
  if (needsToReplaceBallotBag) {
    return false;
  }

  const usbDriveStatus = await usbDrive.status();

  // If there is no USB drive, we can't scan.
  if (usbDriveStatus.status !== 'mounted') {
    return false;
  }

  // If the CVRs are not synced, we can't scan.
  if (await doesUsbDriveRequireCastVoteRecordSync(store, usbDriveStatus)) {
    return false;
  }

  return true;
}
