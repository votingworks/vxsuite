import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import {
  assert,
  DateWithoutTime,
  Optional,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  VendorUser,
} from '@votingworks/types';

import { Card, CardStatus, CheckPinResponse } from './card';

/**
 * The path of the file underlying a MockFileCard
 */
export const MOCK_FILE_PATH = '/tmp/mock-file-card.json';

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
  const { cardStatus, data, pin } = JSON.parse(
    file.toString('utf-8'),
    // Hydrate election date
    (key, value) => (key === 'date' ? new DateWithoutTime(value) : value)
  );
  return {
    cardStatus,
    data: data ? Buffer.from(data, 'hex') : undefined,
    pin,
  };
}

function writeToMockFile(mockFileContents: MockFileContents): void {
  fs.writeFileSync(MOCK_FILE_PATH, serializeMockFileContents(mockFileContents));
}

/**
 * Mocks card actions by updating the file underlying a MockFileCard
 */
export const mockCard = writeToMockFile;

function initializeMockFile() {
  writeToMockFile({
    cardStatus: {
      status: 'no_card',
    },
  });
}

/**
 * A helper for readFromMockFile. Returns undefined if the mock file doesn't exist or can't be
 * parsed.
 */
function readFromMockFileHelper(): Optional<MockFileContents> {
  if (!fs.existsSync(MOCK_FILE_PATH)) {
    return undefined;
  }
  const file = fs.readFileSync(MOCK_FILE_PATH);
  try {
    return deserializeMockFileContents(file);
  } catch {
    return undefined;
  }
}

/**
 * Reads and parses the contents of the file underlying a MockFileCard
 */
export function readFromMockFile(): MockFileContents {
  let mockFileContents = readFromMockFileHelper();
  if (!mockFileContents) {
    initializeMockFile();
    mockFileContents = readFromMockFileHelper();
    assert(mockFileContents !== undefined);
  }
  return mockFileContents;
}

function updateNumIncorrectPinAttempts(
  mockFileContents: MockFileContents,
  numIncorrectPinAttempts?: number
): void {
  const { cardStatus } = mockFileContents;
  assert(
    cardStatus.status === 'ready' && cardStatus.cardDetails.user !== undefined
  );
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
    initializeMockFile();
  }

  getCardStatus(): Promise<CardStatus> {
    const { cardStatus } = readFromMockFile();
    return Promise.resolve(cardStatus);
  }

  checkPin(pin: string): Promise<CheckPinResponse> {
    const mockFileContents = readFromMockFile();
    const { cardStatus } = mockFileContents;
    assert(
      cardStatus.status === 'ready' && cardStatus.cardDetails.user !== undefined
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
      | { user: VendorUser; pin: string }
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string }
      | { user: PollWorkerUser; pin?: string }
  ): Promise<void> {
    const { user, pin } = input;
    const hasPin = pin !== undefined;

    switch (user.role) {
      case 'vendor': {
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { user },
          },
          pin,
        });
        break;
      }
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
        writeToMockFile({
          cardStatus: {
            status: 'ready',
            cardDetails: { user },
          },
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
        cardDetails: {
          user: undefined,
          reason: 'unprogrammed_or_invalid_card',
        },
      },
    });
    return Promise.resolve();
  }

  readData(): Promise<Buffer> {
    const { data } = readFromMockFile();
    return Promise.resolve(data ?? Buffer.of());
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

  disconnect(): Promise<void> {
    return Promise.resolve();
  }
}
