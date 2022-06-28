import {
  AnyCardDataSchema,
  CardStorage,
  DippedSmartcardAuth,
  err,
  InsertedSmartcardAuth,
  ok,
  Optional,
  safeParseJson,
  User,
  wrapException,
} from '@votingworks/types';
import { Card, CardApiReady, throwIllegalValue } from '@votingworks/utils';
import { Lock } from '../use_lock';

export const CARD_POLLING_INTERVAL = 100;

export function parseUserFromCard(card: CardApiReady): Optional<User> {
  if (!card.shortValue) return undefined;
  const cardData = safeParseJson(card.shortValue, AnyCardDataSchema).ok();
  if (!cardData) return undefined;
  switch (cardData.t) {
    case 'superadmin':
      return { role: 'superadmin' };
    case 'admin':
      return { role: 'admin', electionHash: cardData.h, passcode: cardData.p };
    case 'pollworker':
      return { role: 'pollworker', electionHash: cardData.h };
    case 'voter':
      return {
        role: 'voter',
        createdAt: cardData.c,
        ballotStyleId: cardData.bs,
        precinctId: cardData.pr,
        voidedAt: cardData.uz,
        ballotPrintedAt: cardData.bp,
        updatedAt: cardData.u,
        markMachineId: cardData.m,
      };
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(cardData, 't');
  }
}

export function buildCardStorage(
  card: CardApiReady,
  cardApi: Card,
  cardWriteLock: Lock
): CardStorage {
  return {
    hasStoredData: !!card.longValueExists,

    readStoredObject: async (schema) => cardApi.readLongObject(schema),

    readStoredString: async () => {
      try {
        const value = await cardApi.readLongString();
        return ok(value || undefined);
      } catch (error) {
        return wrapException(error);
      }
    },

    readStoredUint8Array: async () => {
      try {
        const value = await cardApi.readLongUint8Array();
        return ok(value && value.length > 0 ? value : undefined);
      } catch (error) {
        return wrapException(error);
      }
    },

    writeStoredData: async (value) => {
      if (!cardWriteLock.lock()) {
        return err(new Error('Card write in progress'));
      }
      try {
        if (value instanceof Uint8Array) {
          await cardApi.writeLongUint8Array(value);
        } else {
          await cardApi.writeLongObject(value);
        }
        return ok();
      } catch (error) {
        return wrapException(error);
      } finally {
        cardWriteLock.unlock();
      }
    },

    clearStoredData: async () => {
      if (!cardWriteLock.lock()) {
        return err(new Error('Card write in progress'));
      }
      try {
        await cardApi.writeLongUint8Array(Uint8Array.of());
        return ok();
      } catch (error) {
        return wrapException(error);
      } finally {
        cardWriteLock.unlock();
      }
    },
  };
}

// Below, we define some useful type guards for checking who's logged in
// We use function overloads to make them work with either Inserted or Dipped auth

export function isSuperadminAuth(
  auth: InsertedSmartcardAuth.Auth
): auth is InsertedSmartcardAuth.SuperadminLoggedIn;
export function isSuperadminAuth(
  auth: DippedSmartcardAuth.Auth
): auth is DippedSmartcardAuth.SuperadminLoggedIn;
export function isSuperadminAuth(
  auth: InsertedSmartcardAuth.Auth | DippedSmartcardAuth.Auth
): boolean {
  return auth.status === 'logged_in' && auth.user.role === 'superadmin';
}

export function isAdminAuth(
  auth: InsertedSmartcardAuth.Auth
): auth is InsertedSmartcardAuth.AdminLoggedIn;
export function isAdminAuth(
  auth: DippedSmartcardAuth.Auth
): auth is DippedSmartcardAuth.AdminLoggedIn;
export function isAdminAuth(
  auth: InsertedSmartcardAuth.Auth | DippedSmartcardAuth.Auth
): boolean {
  return auth.status === 'logged_in' && auth.user.role === 'admin';
}

export function isPollworkerAuth(
  auth: InsertedSmartcardAuth.Auth
): auth is InsertedSmartcardAuth.PollworkerLoggedIn {
  return auth.status === 'logged_in' && auth.user.role === 'pollworker';
}

export function isVoterAuth(
  auth: InsertedSmartcardAuth.Auth
): auth is InsertedSmartcardAuth.VoterLoggedIn {
  return auth.status === 'logged_in' && auth.user.role === 'voter';
}

export function isCardlessVoterAuth(
  auth: InsertedSmartcardAuth.Auth
): auth is InsertedSmartcardAuth.CardlessVoterLoggedIn {
  return auth.status === 'logged_in' && auth.user.role === 'cardless_voter';
}
