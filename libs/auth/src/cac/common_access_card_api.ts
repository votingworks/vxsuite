import { Id } from '@votingworks/types';
import { CertificateProviderCard, SigningCard, StatefulCard } from '../card';

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
 * The API for a Common Access Card-compatible smart card.
 */
export type CommonAccessCardCompatibleCard =
  StatefulCard<CommonAccessCardDetails> & SigningCard & CertificateProviderCard;
