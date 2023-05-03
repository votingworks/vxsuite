import { Buffer } from 'buffer';
import * as fs from 'fs';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
} from '@votingworks/types';

import { Card, CardStatus, CheckPinResponse } from './card';

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
 * Converts a MockFileContents object into a Buffer
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
 * Converts a Buffer created by serializeMockFileContents back into a MockFileContents object
 */
export function deserializeMockFileContents(file: Buffer): MockFileContents {
  const { cardStatus, data, pin } = JSON.parse(file.toString('utf-8'));
  return {
    cardStatus,
    data: data ? Buffer.from(data, 'hex') : undefined,
    pin,
  };
}

function writeToMockFile(
  mockFileContents: MockFileContents,
  // Allow Cypress tests to use cy.writeFile for file writing
  writeFileFn: WriteFileFn = fs.writeFileSync
): void {
  writeFileFn(MOCK_FILE_PATH, serializeMockFileContents(mockFileContents));
}

/**
 * Mocks card actions by updating the file underlying a MockFileCard
 */
export const mockCard = writeToMockFile;

/**
 * Reads and parses the contents of the file underlying a MockFileCard
 */
export function readFromMockFile(): MockFileContents {
  // Initialize the mock file if it doesn't already exist
  if (!fs.existsSync(MOCK_FILE_PATH)) {
    writeToMockFile({
      cardStatus: {
        status: 'no_card',
      },
    });
  }

  const file = fs.readFileSync(MOCK_FILE_PATH);
  return deserializeMockFileContents(file);
}

function updateNumIncorrectPinAttempts(
  mockFileContents: MockFileContents,
  numIncorrectPinAttempts?: number
): void {
  const { cardStatus } = mockFileContents;
  assert(cardStatus.status === 'ready' && cardStatus.cardDetails !== undefined);
  writeToMockFile({
    ...mockFileContents,
    cardStatus: {
      ...cardStatus,
      cardDetails: {
        ...cardStatus.cardDetails,
        numIncorrectPinAttempts,
      },
    },
  });
}

/**
 * A mock implementation of the card API that reads from and writes to a file under the hood. Meant
 * for local development and integration tests.
 *
 * Use ./scripts/mock-card in libs/auth/ to mock cards during local development.
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
    const mockFileContents = readFromMockFile();
    const { cardStatus } = mockFileContents;
    assert(
      cardStatus.status === 'ready' && cardStatus.cardDetails !== undefined
    );
    if (pin === mockFileContents.pin) {
      updateNumIncorrectPinAttempts(mockFileContents, undefined);
      return Promise.resolve({ response: 'correct' });
    }
    const numIncorrectPinAttempts =
      (cardStatus.cardDetails.numIncorrectPinAttempts ?? 0) + 1;
    updateNumIncorrectPinAttempts(mockFileContents, numIncorrectPinAttempts);
    return Promise.resolve({ response: 'incorrect', numIncorrectPinAttempts });
  }

  program(
    input:
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string; electionData: string }
      | { user: PollWorkerUser; pin?: string }
  ): Promise<void> {
    const { user, pin } = input;
    const hasPin = pin !== undefined;

    switch (user.role) {
      case 'system_administrator': {
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { user },
          },
          pin,
        });
        break;
      }
      case 'election_manager': {
        assert('electionData' in input);
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { user },
          },
          data: Buffer.from(input.electionData, 'utf-8'),
          pin,
        });
        break;
      }
      case 'poll_worker': {
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { user, hasPin },
          },
          pin,
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
