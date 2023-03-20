import { Buffer } from 'buffer';
import * as fs from 'fs';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
} from '@votingworks/types';

import { Card, CardStatus, CheckPinResponse } from './card';
import { DEV_JURISDICTION } from './certs';

type WriteFileFn = (filePath: string, fileContents: Buffer) => void;

const MOCK_FILE_PATH = '/tmp/mock-file-card.json';

/**
 * The contents of the file underlying a MockFileCard
 */
export interface MockFileContents {
  cardStatus: CardStatus;
  data?: Buffer;
  pin?: string;
}

/**
 * Convert a MockFileContents object into a Buffer
 */
export function serializeMockFileContents(
  mockFileContents: MockFileContents
): Buffer {
  const { cardStatus, data, pin } = mockFileContents;
  return Buffer.from(
    JSON.stringify({
      cardStatus,
      data: data ? data.toString('hex') : undefined,
      pin,
    }),
    'utf-8'
  );
}

/**
 * Convert a Buffer created by serializeMockFileContents back into a MockFileContents object
 */
export function deserializeMockFileContents(file: Buffer): MockFileContents {
  const { cardStatus, data, pin } = JSON.parse(file.toString('utf-8'));
  return {
    cardStatus,
    data: data ? Buffer.from(data, 'hex') : undefined,
    pin,
  };
}

function readFromMockFile(): MockFileContents {
  const file = fs.readFileSync(MOCK_FILE_PATH);
  return deserializeMockFileContents(file);
}

function writeToMockFile(
  mockFileContents: MockFileContents,
  writeFileFn: WriteFileFn = fs.writeFileSync
): void {
  writeFileFn(MOCK_FILE_PATH, serializeMockFileContents(mockFileContents));
}

/**
 * Mocks card actions by updating the file underlying a MockFileCard
 */
export const mockCard = writeToMockFile;

/**
 * A mock implementation of the card API that reads from and writes to a file under the hood. Meant
 * for local development and integration tests.
 *
 * Use the mock-card script in libs/auth/scripts/ to mock cards during local development.
 */
export class MockFileCard implements Card {
  constructor() {
    writeToMockFile({
      cardStatus: {
        status: 'no_card',
      },
    });
  }

  getCardStatus(): Promise<CardStatus> {
    const { cardStatus } = readFromMockFile();
    return Promise.resolve(cardStatus);
  }

  checkPin(pin: string): Promise<CheckPinResponse> {
    const { pin: actualPin } = readFromMockFile();
    return Promise.resolve(
      pin === actualPin
        ? { response: 'correct' }
        : { response: 'incorrect', numRemainingAttempts: Infinity }
    );
  }

  program(
    input:
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string; electionData: string }
      | { user: PollWorkerUser }
  ): Promise<void> {
    const jurisdiction = DEV_JURISDICTION;
    const { user } = input;

    switch (user.role) {
      case 'system_administrator': {
        assert('pin' in input);
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { jurisdiction, user },
          },
          pin: input.pin,
        });
        break;
      }
      case 'election_manager': {
        assert('pin' in input);
        assert('electionData' in input);
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { jurisdiction, user },
          },
          data: Buffer.from(input.electionData, 'utf-8'),
          pin: input.pin,
        });
        break;
      }
      case 'poll_worker': {
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { jurisdiction, user },
          },
        });
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default:
        throwIllegalValue(user, 'role');
    }
    return Promise.resolve();
  }

  unprogram(): Promise<void> {
    writeToMockFile({
      cardStatus: {
        status: 'ready',
        cardDetails: undefined,
      },
    });
    return Promise.resolve();
  }

  readData(): Promise<Buffer> {
    const { data } = readFromMockFile();
    return Promise.resolve(data ?? Buffer.from([]));
  }

  writeData(data: Buffer): Promise<void> {
    const { cardStatus, pin } = readFromMockFile();
    writeToMockFile({
      cardStatus,
      data,
      pin,
    });
    return Promise.resolve();
  }

  clearData(): Promise<void> {
    const { cardStatus, pin } = readFromMockFile();
    writeToMockFile({
      cardStatus,
      pin,
    });
    return Promise.resolve();
  }
}
