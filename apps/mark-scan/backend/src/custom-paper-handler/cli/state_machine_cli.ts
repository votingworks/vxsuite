/* eslint-disable no-console */

import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import { assert } from '@votingworks/basics';
import { getPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { join } from 'path';
import { LogSource, BaseLogger } from '@votingworks/logging';
import { createWorkspace } from '../../util/workspace';
import { MARK_SCAN_WORKSPACE } from '../../globals';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
} from '../constants';
import {
  PaperHandlerStateMachine,
  getPaperHandlerStateMachine,
} from '../state_machine';
import { getDefaultAuth } from '../../util/auth';
import { MockPatConnectionStatusReader } from '../../pat-input/mock_connection_status_reader';

// We could add a LogSource for this CLI tool but that's unnecessary because
// these logs will never reach production
const logger = new BaseLogger(LogSource.VxMarkScanBackend);

const pathToPdfData = join(__dirname, '..', 'fixtures', 'ballot-pdf-data.bin');

/**
 * Command line interface for debugging the paper handler state machine
 */

enum Command {
  PrintBallotFixture = 'print',
}
const commandList = Object.values(Command);

function printUsage() {
  console.log(`Valid commands: ${JSON.stringify(commandList)}`);
}

function printBallotFixture(stateMachine: PaperHandlerStateMachine) {
  const pdfData = readFileSync(pathToPdfData, { encoding: null });
  stateMachine.printBallot(pdfData);
}

function handleCommand(
  stateMachine: PaperHandlerStateMachine,
  command: Command
) {
  assert(stateMachine);
  if (command === Command.PrintBallotFixture) {
    printBallotFixture(stateMachine);
    console.log('TODO');
  } else {
    throw new Error(`Unhandled command: ${command}`);
  }

  console.log('Command finished');
}

async function logStatus(
  stateMachine: PaperHandlerStateMachine
): Promise<void> {
  const rawStatus = await stateMachine.getRawDeviceStatus();
  console.log('Raw status:', JSON.stringify(rawStatus, null, 2));
  console.log('Status:', stateMachine.getSimpleStatus());
  setTimeout(async () => {
    await logStatus(stateMachine);
  }, 1000);
}

export async function main(): Promise<number> {
  printUsage();
  const workspacePath = MARK_SCAN_WORKSPACE;
  assert(workspacePath !== undefined, 'expected workspace path');
  const workspace = createWorkspace(workspacePath);

  const auth = getDefaultAuth(logger);

  const driver = await getPaperHandlerDriver();
  assert(
    driver,
    'Could not get paper handler driver. Is a paper handler device connected?'
  );

  const patConnectionStatusReader = new MockPatConnectionStatusReader(logger);

  const stateMachine = await getPaperHandlerStateMachine({
    workspace,
    auth,
    logger,
    driver,
    patConnectionStatusReader,
    devicePollingIntervalMs: DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
    authPollingIntervalMs: AUTH_STATUS_POLLING_INTERVAL_MS,
  });
  assert(stateMachine !== undefined, 'Unexpected undefined state machine');

  stateMachine.setAcceptingPaper();
  await logStatus(stateMachine);

  const lines = createInterface(process.stdin);

  for await (const line of lines) {
    const parts = line.split(' ');
    const [commandString] = parts;

    if (!commandString) {
      console.log('No command provided');
      continue;
    }

    if (!commandList.includes(commandString as Command)) {
      console.log(
        `Unsupported command '${commandString}'.\nSupported commands: ${JSON.stringify(
          commandList
        )}\n`
      );
      continue;
    }

    handleCommand(stateMachine, commandString as Command);
  }

  return 0;
}
