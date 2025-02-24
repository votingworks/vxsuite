import { extractErrorMessage, Result, sleep } from '@votingworks/basics';

import { constructAuthMachineState } from '../util/auth';
import { ServerContext } from './context';

const CARD_READ_INTERVAL_SECONDS = 5;

function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}

export async function cardReadLoop({
  auth,
  workspace,
}: ServerContext): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const machineState = constructAuthMachineState(workspace);
    const cardReadResult = await auth.readCardData(machineState);
    workspace.store.setElectricalTestingStatusMessage(
      'card',
      resultToString(cardReadResult)
    );

    await sleep(CARD_READ_INTERVAL_SECONDS * 1000);
  }
}

export async function printAndScanLoop(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(5000);
  }
}
