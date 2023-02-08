import { throwIllegalValue } from '@votingworks/basics';
import {
  AnyCardDataSchema,
  CardSummaryReady,
  Optional,
  safeParseJson,
  User,
} from '@votingworks/types';

/**
 * The frequency with which we poll the memory card summary
 */
export const CARD_POLLING_INTERVAL_MS = 100;

/**
 * Parses a user from a memory card summary
 */
export function parseUserFromCardSummary(
  cardSummary: CardSummaryReady
): Optional<User> {
  if (!cardSummary.shortValue) {
    return undefined;
  }

  const cardData = safeParseJson(
    cardSummary.shortValue,
    AnyCardDataSchema
  ).ok();
  if (!cardData) {
    return undefined;
  }

  switch (cardData.t) {
    case 'system_administrator':
      return {
        role: 'system_administrator',
        passcode: cardData.p,
      };
    case 'election_manager':
      return {
        role: 'election_manager',
        electionHash: cardData.h,
        passcode: cardData.p,
      };
    case 'poll_worker':
      return {
        role: 'poll_worker',
        electionHash: cardData.h,
      };
    case 'voter':
      return {
        role: 'voter',
        ballotPrintedAt: cardData.bp,
        ballotStyleId: cardData.bs,
        createdAt: cardData.c,
        markMachineId: cardData.m,
        precinctId: cardData.pr,
        updatedAt: cardData.u,
        voidedAt: cardData.uz,
      };
    /* istanbul ignore next: Compile-time check for completeness */
    default:
      throwIllegalValue(cardData, 't');
  }
}
