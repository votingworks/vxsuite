import { spawnSync } from 'child_process';
import { assert, sleep } from '@votingworks/basics';

import { Card } from '../src/card';

/**
 * Checks whether an error contains the specified message
 */
export function errorContains(error: unknown, message: string): boolean {
  return error instanceof Error && error.message.includes(message);
}

/**
 * Runs the provided shell command, returning the standard output. Throws an error if the process
 * exits with a non-success status code.
 */
export function runCommand(command: string[]): string {
  assert(command[0] !== undefined);
  const { status, stderr, stdout } = spawnSync(command[0], command.slice(1));
  if (status !== 0) {
    throw new Error(stderr.toString('utf-8'));
  }
  return stdout.toString('utf-8');
}

/**
 * Waits for a card to have a ready status
 */
export async function waitForReadyCardStatus(
  card: Card,
  waitTimeSeconds = 3
): Promise<void> {
  let cardStatus = await card.getCardStatus();
  let remainingWaitTimeSeconds = waitTimeSeconds;
  while (cardStatus.status !== 'ready' && remainingWaitTimeSeconds > 0) {
    await sleep(1000);
    cardStatus = await card.getCardStatus();
    remainingWaitTimeSeconds -= 1;
  }
  if (cardStatus.status !== 'ready') {
    throw new Error(`Card status not "ready" after ${waitTimeSeconds} seconds`);
  }
}
