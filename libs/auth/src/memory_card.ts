import { Buffer } from 'buffer';
import { z } from 'zod';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionHash,
  ElectionManagerUser,
  PollWorkerUser,
  safeParseJson,
  SystemAdministratorUser,
  UserRole,
  UserRoleSchema,
  UserWithCard,
} from '@votingworks/types';

import { Card, CardDetails, CardStatus, CheckPinResponse } from './card';
import { DEV_JURISDICTION } from './certs';
import * as Legacy from './legacy';

interface CardData {
  readonly t: UserRole;
}

const CardDataSchema = z.object({
  t: UserRoleSchema,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CardDataSchemaTypeCheck: z.ZodSchema<CardData> = CardDataSchema;

/**
 * The representation of a system administrator on a memory card
 */
interface SystemAdministratorCardData extends CardData {
  readonly t: 'system_administrator';
  /** PIN */
  readonly p: string;
}

const SystemAdministratorCardDataSchema: z.ZodSchema<SystemAdministratorCardData> =
  CardDataSchema.extend({
    t: z.literal('system_administrator'),
    p: z.string(),
  });

/**
 * The representation of an election manager on a memory card
 */
interface ElectionManagerCardData extends CardData {
  readonly t: 'election_manager';
  /** Election hash */
  readonly h: string;
  /** PIN */
  readonly p: string;
}

const ElectionManagerCardDataSchema: z.ZodSchema<ElectionManagerCardData> =
  CardDataSchema.extend({
    t: z.literal('election_manager'),
    h: ElectionHash,
    p: z.string(),
  });

/**
 * The representation of a poll worker on a memory card
 */
interface PollWorkerCardData extends CardData {
  readonly t: 'poll_worker';
  /** Election hash */
  readonly h: string;
  /** PIN */
  readonly p?: string;
}

const PollWorkerCardDataSchema: z.ZodSchema<PollWorkerCardData> =
  CardDataSchema.extend({
    t: z.literal('poll_worker'),
    h: ElectionHash,
    p: z.optional(z.string()),
  });

type AnyCardData =
  | SystemAdministratorCardData
  | ElectionManagerCardData
  | PollWorkerCardData;

const AnyCardDataSchema: z.ZodSchema<AnyCardData> = z.union([
  PollWorkerCardDataSchema,
  ElectionManagerCardDataSchema,
  SystemAdministratorCardDataSchema,
]);

function parseUserDataFromCardSummary(cardSummary: Legacy.CardSummaryReady): {
  user?: UserWithCard;
  pin?: string;
} {
  if (!cardSummary.shortValue) {
    return {};
  }

  const cardData = safeParseJson(
    cardSummary.shortValue,
    AnyCardDataSchema
  ).ok();
  if (!cardData) {
    return {};
  }

  switch (cardData.t) {
    case 'system_administrator':
      return {
        user: { role: 'system_administrator' },
        pin: cardData.p,
      };
    case 'election_manager':
      return {
        user: { role: 'election_manager', electionHash: cardData.h },
        pin: cardData.p,
      };
    case 'poll_worker':
      return {
        user: { role: 'poll_worker', electionHash: cardData.h },
        pin: cardData.p,
      };
    /* istanbul ignore next: Compile-time check for completeness */
    default:
      throwIllegalValue(cardData, 't');
  }
}

/**
 * @deprecated
 *
 * An implementation of the card API that uses a memory card. Wraps around the legacy card API.
 */
export class MemoryCard implements Card {
  private readonly card: Legacy.Card;

  constructor(input: { baseUrl: string }) {
    this.card = new Legacy.WebServiceCard({ baseUrl: input.baseUrl });
  }

  async getCardStatus(): Promise<CardStatus> {
    const cardSummary = await this.card.readSummary();
    if (cardSummary.status !== 'ready') {
      return {
        status:
          cardSummary.status === 'error' ? 'card_error' : cardSummary.status,
      };
    }
    const { user, pin } = parseUserDataFromCardSummary(cardSummary);
    if (!user) {
      return {
        status: 'ready',
        cardDetails: undefined,
      };
    }
    let cardDetails: CardDetails;
    switch (user.role) {
      case 'system_administrator': {
        cardDetails = {
          jurisdiction: DEV_JURISDICTION,
          user,
        };
        break;
      }
      case 'election_manager': {
        cardDetails = {
          jurisdiction: DEV_JURISDICTION,
          user,
        };
        break;
      }
      case 'poll_worker': {
        cardDetails = {
          jurisdiction: DEV_JURISDICTION,
          user,
          hasPin: pin !== undefined,
        };
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(user, 'role');
      }
    }
    return { status: 'ready', cardDetails };
  }

  async checkPin(pin: string): Promise<CheckPinResponse> {
    const cardSummary = await this.card.readSummary();
    if (cardSummary.status !== 'ready') {
      throw new Error('Card status is not ready');
    }
    const { pin: correctPin } = parseUserDataFromCardSummary(cardSummary);
    return pin === correctPin
      ? { response: 'correct' }
      : // Since this implementation is deprecated, don't bother with incorrect PIN attempt tracking
        // and by extension support for card lockout
        { response: 'incorrect', numIncorrectPinAttempts: 0 };
  }

  async program(
    input:
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string; electionData: string }
      | { user: PollWorkerUser; pin?: string }
  ): Promise<void> {
    const { pin, user } = input;
    switch (user.role) {
      case 'system_administrator': {
        assert(pin !== undefined);
        const cardData: SystemAdministratorCardData = {
          t: 'system_administrator',
          p: pin,
        };
        await this.card.overrideWriteProtection();
        await this.card.writeShortValue(JSON.stringify(cardData));
        break;
      }
      case 'election_manager': {
        assert(pin !== undefined);
        assert('electionData' in input);
        const cardData: ElectionManagerCardData = {
          t: 'election_manager',
          h: user.electionHash,
          p: pin,
        };
        await this.card.overrideWriteProtection();
        await this.card.writeShortAndLongValues({
          shortValue: JSON.stringify(cardData),
          longValue: input.electionData,
        });
        break;
      }
      case 'poll_worker': {
        const cardData: PollWorkerCardData = {
          t: 'poll_worker',
          h: user.electionHash,
          p: pin,
        };
        await this.card.overrideWriteProtection();
        await this.card.writeShortValue(JSON.stringify(cardData));
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default:
        throwIllegalValue(user, 'role');
    }
  }

  async unprogram(): Promise<void> {
    await this.card.overrideWriteProtection();
    await this.card.writeShortAndLongValues({
      shortValue: '',
      longValue: '',
    });
  }

  async readData(): Promise<Buffer> {
    const data = await this.card.readLongString();
    return data ? Buffer.from(data, 'utf-8') : Buffer.from([]);
  }

  async writeData(data: Buffer): Promise<void> {
    await this.card.writeLongUint8Array(data);
  }

  async clearData(): Promise<void> {
    await this.card.writeLongUint8Array(Buffer.from([]));
  }
}
