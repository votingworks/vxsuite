import type { Result } from '@votingworks/basics';
import type { Byte, Id } from '@votingworks/types';
import type { Buffer } from 'node:buffer';
import type { ResponseApduError } from '../apdu.js';
import type { BaseCard, PinProtectedCard, StatefulCard } from '../card.js';

/**
 * Details about a Common Access Card.
 */
export interface CommonAccessCardDetails {
  commonAccessCardId: Id;
  givenName: string;
  middleName?: string;
  familyName: string;
}

/**
 * The API for a smart card that can sign a payload.
 */
export interface SigningCard {
  generateSignature(
    message: Buffer,
    options: { privateKeyId: Byte; pin?: string }
  ): Promise<Result<Buffer, GenerateSignatureError>>;
}

/**
 * An error that can occur when generating a signature.
 */
export type GenerateSignatureError =
  | {
      type: 'card_error';
      error: ResponseApduError;
      message: string;
    }
  | {
      type: 'incorrect_pin';
      message: string;
    };

/**
 * The API for a smart card that has stored certificates.
 */
export interface CertificateProviderCard {
  getCertificate(options: { objectId: Buffer }): Promise<Buffer>;
}

/**
 * The API for a Common Access Card-compatible smart card.
 */
export type CommonAccessCardCompatibleCard = BaseCard &
  StatefulCard<CommonAccessCardDetails | undefined> &
  PinProtectedCard &
  SigningCard &
  CertificateProviderCard;
