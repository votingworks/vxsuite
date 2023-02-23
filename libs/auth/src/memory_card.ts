import { Buffer } from 'buffer';
import { z } from 'zod';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  ElectionHash,
  ElectionManagerUser,
  PollWorkerUser,
  safeParseJson,
  SystemAdministratorUser,
  User,
  UserRole,
  UserRoleSchema,
} from '@votingworks/types';

import { Card, CardStatus, CheckPinResponse } from './card';
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
}

const PollWorkerCardDataSchema: z.ZodSchema<PollWorkerCardData> =
  CardDataSchema.extend({
    t: z.literal('poll_worker'),
    h: ElectionHash,
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
  user?: User;
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
      };
    /* istanbul ignore next: Compile-time check for completeness */
    default:
      throwIllegalValue(cardData, 't');
  }
}

/**
 * An implementation of the card API that uses a memory card under the hood. Wraps around the
 * legacy card API
 */
export class MemoryCard implements Card {
  private readonly card: Legacy.Card;

  constructor({ baseUrl }: { baseUrl: string }) {
    this.card = new Legacy.WebServiceCard({ baseUrl });
  }

  async getCardStatus(): Promise<CardStatus> {
    const cardSummary = await this.card.readSummary();
    return {
      status: cardSummary.status,
      user:
        cardSummary.status === 'ready'
          ? parseUserDataFromCardSummary(cardSummary).user
          : undefined,
    };
  }

  async checkPin(pin: string): Promise<CheckPinResponse> {
    const cardSummary = await this.card.readSummary();
    if (cardSummary.status !== 'ready') {
      return { response: 'error' };
    }
    const { pin: correctPin } = parseUserDataFromCardSummary(cardSummary);
    return pin === correctPin
      ? { response: 'correct' }
      : { response: 'incorrect', numRemainingAttempts: Infinity };
  }

  async writeUser(
    input:
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string }
      | { user: PollWorkerUser }
  ): Promise<void> {
    const { user } = input;
    switch (user.role) {
      case 'system_administrator': {
        assert('pin' in input);
        const cardData: SystemAdministratorCardData = {
          t: 'system_administrator',
          p: input.pin,
        };
        await this.card.overrideWriteProtection();
        await this.card.writeShortValue(JSON.stringify(cardData));
        break;
      }
      case 'election_manager': {
        assert('electionHash' in input.user);
        assert('pin' in input);
        const cardData: ElectionManagerCardData = {
          t: 'election_manager',
          h: input.user.electionHash,
          p: input.pin,
        };
        await this.card.overrideWriteProtection();
        await this.card.writeShortValue(JSON.stringify(cardData));
        break;
      }
      case 'poll_worker': {
        assert('electionHash' in input.user);
        assert('pin' in input);
        const cardData: PollWorkerCardData = {
          t: 'poll_worker',
          h: input.user.electionHash,
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

  async readData(): Promise<Buffer> {
    const data = await this.card.readLongString();
    return data ? Buffer.from(data, 'utf-8') : Buffer.from([]);
  }

  async writeData(data: Buffer): Promise<void> {
    await this.card.writeLongUint8Array(data);
  }

  async clearUserAndData(): Promise<void> {
    await this.card.overrideWriteProtection();
    await this.card.writeShortAndLongValues({
      shortValue: '',
      longValue: '',
    });
  }
}
