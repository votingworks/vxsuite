/* eslint-disable max-classes-per-file */
import path from 'node:path';
import { MockFunction, mockFunction } from '@votingworks/test-utils';
import { ProgrammingMachineType } from '@votingworks/types';

import { Card, CardStatus } from '../src/card';
import {
  CardReader,
  OnReaderStatusChange,
  ReaderStatus,
} from '../src/card_reader';
import { CardType } from '../src/certs';
import {
  CertDerFile,
  CertPemFile,
  derFile,
  pemFile,
  PrivateKeyDerFile,
  PrivateKeyPemFile,
  PublicKeyDerFile,
  PublicKeyPemFile,
} from '../src/cryptographic_material';
import { JavaCard } from '../src/java_card';

/**
 * A mock card reader
 */
export class MockCardReader implements Pick<CardReader, 'transmit'> {
  private readonly onReaderStatusChange: OnReaderStatusChange;

  constructor(input: ConstructorParameters<typeof CardReader>[0]) {
    this.onReaderStatusChange = input.onReaderStatusChange;
  }

  setReaderStatus(readerStatus: ReaderStatus): void {
    this.onReaderStatusChange(readerStatus);
  }

  // eslint-disable-next-line vx/gts-no-public-class-fields
  disconnectCard: MockFunction<CardReader['disconnectCard']> =
    mockFunction<CardReader['disconnectCard']>('disconnectCard');

  // eslint-disable-next-line vx/gts-no-public-class-fields
  transmit: MockFunction<CardReader['transmit']> =
    mockFunction<CardReader['transmit']>('transmit');
}

/**
 * The card API with all methods mocked using our custom libs/test-utils mocks
 */
export interface MockCard {
  getCardStatus: MockFunction<Card['getCardStatus']>;
  checkPin: MockFunction<Card['checkPin']>;
  program: MockFunction<Card['program']>;
  readData: MockFunction<Card['readData']>;
  writeData: MockFunction<Card['writeData']>;
  clearData: MockFunction<Card['clearData']>;
  unprogram: MockFunction<Card['unprogram']>;
  disconnect: MockFunction<Card['disconnect']>;
}

/**
 * Builds a mock card instance
 */
export function buildMockCard(): MockCard {
  return {
    getCardStatus: mockFunction<Card['getCardStatus']>('getCardStatus'),
    checkPin: mockFunction<Card['checkPin']>('checkPin'),
    program: mockFunction<Card['program']>('program'),
    readData: mockFunction<Card['readData']>('readData'),
    writeData: mockFunction<Card['writeData']>('writeData'),
    clearData: mockFunction<Card['clearData']>('clearData'),
    unprogram: mockFunction<Card['unprogram']>('unprogram'),
    disconnect: mockFunction<Card['disconnect']>('disconnect'),
  };
}

/**
 * Asserts that all the expected calls to all the methods of a mock card were made
 */
export function mockCardAssertComplete(mockCard: MockCard): void {
  for (const mockMethod of Object.values(mockCard) as Array<
    MockCard[keyof MockCard]
  >) {
    mockMethod.assertComplete();
  }
}

/**
 * An extension of the Java Card class with a method for manually setting the card status to
 * simplify setup for Java Card tests that require the card to be in a specific starting state
 */
export class TestJavaCard extends JavaCard {
  setCardStatus(cardStatus: CardStatus): void {
    this.cardStatus = cardStatus;
  }
}

/**
 * An identifier for a set of test files
 */
export type TestFileSetId = '1' | '2';

type RootPrivateKeyPemTestFileType = 'vx-private-key.pem';
type RootCertPemTestFileType = 'vx-cert-authority-cert.pem';

type MachinePrivateKeyPemTestFileType =
  | 'vx-admin-private-key.pem'
  | 'vx-central-scan-private-key.pem'
  | 'vx-mark-private-key.pem'
  | 'vx-poll-book-private-key.pem'
  | 'vx-private-key.pem'
  | 'vx-scan-private-key.pem';
type MachineCertPemTestFileType =
  | 'vx-admin-cert-authority-cert.pem'
  | 'vx-central-scan-cert.pem'
  | 'vx-mark-cert.pem'
  | 'vx-poll-book-cert-authority-cert.pem'
  | 'vx-scan-cert.pem';
type MachineCertDerTestFileType =
  | 'vx-admin-cert-authority-cert.der'
  | 'vx-poll-book-cert-authority-cert.der';

type CardPrivateKeyPemTestFileType =
  | 'card-identity-private-key.pem'
  | 'card-vx-private-key.pem';
type CardPublicKeyDerTestFileType =
  | 'card-identity-public-key.der'
  | 'card-vx-public-key.der';
type CardCertDerTestFileType =
  | 'card-identity-cert-expired.der'
  | 'card-identity-cert.der'
  | 'card-vx-cert.der';

type TestFileType =
  | RootPrivateKeyPemTestFileType
  | RootCertPemTestFileType
  | MachinePrivateKeyPemTestFileType
  | MachineCertPemTestFileType
  | MachineCertDerTestFileType
  | CardPrivateKeyPemTestFileType
  | CardPublicKeyDerTestFileType
  | CardCertDerTestFileType;

/** */
export function getTestFile(input: {
  fileType: RootPrivateKeyPemTestFileType | MachinePrivateKeyPemTestFileType;
  setId?: TestFileSetId;
}): PrivateKeyPemFile;

/** */
export function getTestFile(input: {
  fileType: RootCertPemTestFileType | MachineCertPemTestFileType;
  setId?: TestFileSetId;
}): CertPemFile;

/** */
export function getTestFile(input: {
  fileType: MachineCertDerTestFileType;
  setId?: TestFileSetId;
}): CertDerFile;

/** */
export function getTestFile(input: {
  fileType: CardPrivateKeyPemTestFileType;
  cardType: CardType;
  programmingMachineType?: ProgrammingMachineType;
  setId?: TestFileSetId;
}): PrivateKeyPemFile;

/** */
export function getTestFile(input: {
  fileType: CardPrivateKeyPemTestFileType;
  cardType: CardType;
  programmingMachineType?: ProgrammingMachineType;
  setId?: TestFileSetId;
}): PrivateKeyPemFile;

/** */
export function getTestFile(input: {
  fileType: CardPublicKeyDerTestFileType;
  cardType: CardType;
  programmingMachineType?: ProgrammingMachineType;
  setId?: TestFileSetId;
}): PublicKeyDerFile;

/** */
export function getTestFile(input: {
  fileType: CardCertDerTestFileType;
  cardType: CardType;
  programmingMachineType?: ProgrammingMachineType;
  setId?: TestFileSetId;
}): CertDerFile;

/**
 * Gets the file path of a test key or cert generated by ./scripts/generate-test-keys-and-certs
 */
export function getTestFile({
  fileType,
  cardType,
  programmingMachineType,
  setId,
}: {
  fileType: TestFileType;
  cardType?: CardType;
  programmingMachineType?: ProgrammingMachineType;
  setId?: TestFileSetId;
}):
  | CertDerFile
  | CertPemFile
  | PrivateKeyDerFile
  | PrivateKeyPemFile
  | PublicKeyDerFile
  | PublicKeyPemFile {
  const filePathParts: string[] = [
    '.',
    'certs',
    'test',
    `set-${setId ?? '1'}`,
    cardType,
    cardType && cardType !== 'vendor'
      ? `vx-${programmingMachineType ?? 'admin'}-programmed`
      : undefined,
    fileType,
  ].filter((part): part is string => Boolean(part));
  const filePath = path.join(...filePathParts);

  const fileConstructor = fileType.endsWith('.der') ? derFile : pemFile;
  if (fileType.includes('-cert')) {
    return fileConstructor('cert', filePath);
  }
  if (fileType.includes('-private-key')) {
    return fileConstructor('private_key', filePath);
  }
  if (fileType.includes('-public-key')) {
    return fileConstructor('public_key', filePath);
  }
  throw new Error(`Invalid test file type: ${fileType}`);
}
