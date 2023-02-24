import { Buffer } from 'buffer';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  User,
} from '@votingworks/types';

interface CardStatusReady {
  status: 'ready';
  user?: User;
}

interface CardStatusNoCard {
  status: 'no_card';
}

interface CardStatusError {
  status: 'error';
}

/**
 * The status of a card in a card reader
 */
export type CardStatus = CardStatusReady | CardStatusNoCard | CardStatusError;

interface CheckPinResponseCorrect {
  response: 'correct';
}

interface CheckPinResponseIncorrect {
  response: 'incorrect';
  numRemainingAttempts: number;
}

interface CheckPinResponseError {
  response: 'error';
}

/**
 * The response to a PIN check
 */
export type CheckPinResponse =
  | CheckPinResponseCorrect
  | CheckPinResponseIncorrect
  | CheckPinResponseError;

/**
 * The API for a card
 */
export interface Card {
  getCardStatus(): Promise<CardStatus>;

  checkPin(pin: string): Promise<CheckPinResponse>;

  program(
    input:
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string; electionData: string }
      | { user: PollWorkerUser }
  ): Promise<void>;

  readData(): Promise<Buffer>;
  writeData(data: Buffer): Promise<void>;
  clearData(): Promise<void>;

  unprogram(): Promise<void>;
}
