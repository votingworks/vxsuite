import { Buffer } from 'node:buffer';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  VendorUser,
} from '@votingworks/types';

import { ResponseApduError } from './apdu';
import { UNIVERSAL_VENDOR_CARD_JURISDICTION } from './jurisdictions';

interface VendorCardDetails {
  user: VendorUser;
  numIncorrectPinAttempts?: number;
}

interface SystemAdministratorCardDetails {
  user: SystemAdministratorUser;
  numIncorrectPinAttempts?: number;
}

interface ElectionManagerCardDetails {
  user: ElectionManagerUser;
  numIncorrectPinAttempts?: number;
}

interface PollWorkerCardDetails {
  user: PollWorkerUser;
  numIncorrectPinAttempts?: number;

  /**
   * Unlike system administrator and election manager cards, which always have PINs, poll worker
   * cards by default don't have PINs but can if the relevant system setting is enabled.
   */
  hasPin: boolean;
}

/**
 * Details about a programmed card
 */
export type ProgrammedCardDetails =
  | VendorCardDetails
  | SystemAdministratorCardDetails
  | ElectionManagerCardDetails
  | PollWorkerCardDetails;

/**
 * Details about an unprogrammed or invalid card. Does not include cards that are only contextually
 * invalid, e.g., because the jurisdiction or election on the card doesn't match that on the
 * machine. *Does* include cards that are invalid because they're configured for the wrong
 * environment, dev vs. prod.
 */
export interface UnprogrammedOrInvalidCardDetails {
  user: undefined;
  reason:
    | 'certificate_expired'
    | 'certificate_not_yet_valid'
    | 'unprogrammed_or_invalid_card';
}

/**
 * Details about a card
 */
export type CardDetails =
  | ProgrammedCardDetails
  | UnprogrammedOrInvalidCardDetails;

/**
 * A CardDetails type guard
 */
export function areVendorCardDetails(
  cardDetails: CardDetails
): cardDetails is VendorCardDetails {
  return cardDetails.user?.role === 'vendor';
}

/**
 * An extension of {@link areVendorCardDetails} that checks whether a card is a universal vendor
 * card granting vendor access to machines regardless of their jurisdiction
 */
export function areUniversalVendorCardDetails(
  cardDetails: CardDetails
): cardDetails is VendorCardDetails {
  return (
    areVendorCardDetails(cardDetails) &&
    cardDetails.user.jurisdiction === UNIVERSAL_VENDOR_CARD_JURISDICTION
  );
}

/**
 * A CardDetails type guard
 */
export function areSystemAdministratorCardDetails(
  cardDetails: CardDetails
): cardDetails is SystemAdministratorCardDetails {
  return cardDetails.user?.role === 'system_administrator';
}

/**
 * A CardDetails type guard
 */
export function areElectionManagerCardDetails(
  cardDetails: CardDetails
): cardDetails is ElectionManagerCardDetails {
  return cardDetails.user?.role === 'election_manager';
}

/**
 * A CardDetails type guard
 */
export function arePollWorkerCardDetails(
  cardDetails: CardDetails
): cardDetails is PollWorkerCardDetails {
  return cardDetails.user?.role === 'poll_worker';
}

/**
 * A sub-type of CardStatus
 */
export interface CardStatusReady<T = CardDetails> {
  status: 'ready';
  cardDetails: T;
}

/**
 * A sub-type of CardStatus
 */
export interface CardStatusNotReady {
  status: 'card_error' | 'no_card_reader' | 'no_card' | 'unknown_error';
}

/**
 * The status of a card in a card reader
 */
export type CardStatus<T = CardDetails> =
  | CardStatusReady<T>
  | CardStatusNotReady;

interface CheckPinResponseCorrect {
  response: 'correct';
}

interface CheckPinResponseIncorrect {
  response: 'incorrect';
  numIncorrectPinAttempts: number;
}

interface CheckPinResponseError {
  response: 'error';
  error: ResponseApduError;
}

/**
 * The response to a PIN check
 */
export type CheckPinResponse =
  | CheckPinResponseCorrect
  | CheckPinResponseIncorrect
  | CheckPinResponseError;

/**
 * The base API any card should support
 */
export interface BaseCard {
  disconnect(): Promise<void>;
}

/**
 * The API for a card that can provide its status
 */
export interface StatefulCard<T = CardDetails> {
  getCardStatus(): Promise<CardStatus<T>>;
}

/**
 * The API for a card that has a PIN
 */
export interface PinProtectedCard {
  checkPin(pin: string): Promise<CheckPinResponse>;
}

/**
 * The API for a card that can be programmed
 */
export interface ProgrammableCard extends PinProtectedCard {
  program(
    input:
      | { user: VendorUser; pin: string }
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string }
      | { user: PollWorkerUser; pin?: string }
  ): Promise<void>;
  unprogram(): Promise<void>;
}

/**
 * The API for a card that can store data
 */
export interface DataCard {
  readData(): Promise<Buffer>;
  writeData(data: Buffer): Promise<void>;
  clearData(): Promise<void>;
}

/**
 * The API for a VxSuite-compatible card
 */
export type Card = BaseCard &
  StatefulCard &
  PinProtectedCard &
  ProgrammableCard &
  DataCard;
