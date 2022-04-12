import {
  UserRole,
  SmartcardAuth,
  User,
  safeParseJson,
  AnyCardDataSchema,
  AnyCardData,
  CardStorage,
  ok,
  err,
  LoggedOutAuth,
  LoggedInAuth,
  ElectionDefinition,
  Result,
  AdminLoggedInAuth,
  PollworkerLoggedInAuth,
  SuperadminLoggedInAuth,
  VoterLoggedInAuth,
} from '@votingworks/types';
import {
  assert,
  Card,
  CardApi,
  CardApiReady,
  throwIllegalValue,
} from '@votingworks/utils';
import { useReducer } from 'react';
import useInterval from 'use-interval';
import deepEqual from 'deep-eql';
import { CARD_POLLING_INTERVAL } from './use_smartcard';
import { Lock, useLock } from './use_lock';

interface UseSmartcardAuthArgs {
  cardApi: Card;
  electionDefinition?: ElectionDefinition;
  allowedUserRoles: UserRole[];
}

type AuthState =
  | Pick<LoggedOutAuth, 'status' | 'reason'>
  | Pick<LoggedInAuth, 'status' | 'user'>;

interface SmartcardAuthState {
  card: CardApi;
  auth: AuthState;
}

// For now, there's just one smartcard auth action type, but there will be more
// as this hook gets fleshed out.
interface SmartcardAuthAction {
  type: 'card_read';
  card: CardApi;
}

function cardDataToUser(cardData: AnyCardData): User {
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

function parseUserFromCard(card: CardApiReady): User | undefined {
  if (!card.shortValue) return undefined;
  const cardData = safeParseJson(card.shortValue, AnyCardDataSchema).ok();
  return cardData && cardDataToUser(cardData);
}

function attemptLogin(
  card: CardApiReady,
  allowedUserRoles: UserRole[],
  electionDefinition?: ElectionDefinition
): Result<User, LoggedOutAuth['reason']> {
  const user = parseUserFromCard(card);
  if (!user) return err('invalid_user_on_card');
  if (!allowedUserRoles.includes(user.role)) {
    return err('user_role_not_allowed');
  }
  if (user.role === 'pollworker') {
    if (!electionDefinition) return err('machine_not_configured');
    if (user.electionHash !== electionDefinition.electionHash) {
      return err('pollworker_election_hash_mismatch');
    }
  }
  return ok(user);
}

function smartcardAuthReducer(
  allowedUserRoles: UserRole[],
  electionDefinition?: ElectionDefinition
) {
  return (
    prev: SmartcardAuthState,
    action: SmartcardAuthAction
  ): SmartcardAuthState => {
    switch (action.type) {
      case 'card_read': {
        // Only update card/auth state if the card actually changed.
        // This is just an optimization to prevent unnecessary re-renders.
        if (deepEqual(prev.card, action.card)) return prev;

        const newAuth = ((): AuthState => {
          switch (action.card.status) {
            case 'no_card':
              return { status: 'logged_out', reason: 'no_card' };
            case 'error':
              return { status: 'logged_out', reason: 'card_error' };
            case 'ready': {
              const loginResult = attemptLogin(
                action.card,
                allowedUserRoles,
                electionDefinition
              );
              if (loginResult.isOk()) {
                return { status: 'logged_in', user: loginResult.ok() };
              }
              return { status: 'logged_out', reason: loginResult.err() };
            }
            /* istanbul ignore next - compile time check for completeness */
            default:
              throwIllegalValue(action.card, 'status');
          }
        })();
        return { card: action.card, auth: newAuth };
      }
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(action.type);
    }
  };
}

function buildCardStorage(
  card: CardApiReady,
  cardApi: Card,
  cardWriteLock: Lock
): CardStorage {
  return {
    hasStoredData: !!card.longValueExists,

    readStoredObject: async (schema) => cardApi.readLongObject(schema),

    readStoredString: async () => {
      try {
        return ok((await cardApi.readLongString()) || undefined);
      } catch (error) {
        return err(error);
      }
    },

    readStoredUint8Array: async () => {
      try {
        const value = await cardApi.readLongUint8Array();
        return ok(value && value.length > 0 ? value : undefined);
      } catch (error) {
        return err(error);
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
        return err(error);
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
        return err(error);
      } finally {
        cardWriteLock.unlock();
      }
    },
  };
}

export function useSmartcardAuth({
  cardApi,
  electionDefinition,
  allowedUserRoles,
}: UseSmartcardAuthArgs): SmartcardAuth {
  const [{ card, auth }, dispatch] = useReducer(
    smartcardAuthReducer(allowedUserRoles, electionDefinition),
    {
      card: { status: 'no_card' },
      auth: { status: 'logged_out', reason: 'no_card' },
    }
  );
  // Use a lock to guard against concurrent writes to the card
  const cardWriteLock = useLock();

  useInterval(
    async () => {
      const newCard = await cardApi.readStatus();
      dispatch({ type: 'card_read', card: newCard });
    },
    CARD_POLLING_INTERVAL,
    true
  );

  switch (auth.status) {
    case 'logged_out':
      return auth;

    case 'logged_in': {
      assert(card.status === 'ready');
      const cardStorage = buildCardStorage(card, cardApi, cardWriteLock);
      // For now, all roles receive the same auth object, but will get different
      // functionality as this hook gets fleshed out.
      const { status, user } = auth;
      switch (user.role) {
        case 'superadmin':
          return { status, user, card: cardStorage };

        case 'admin':
          return { status, user, card: cardStorage };

        case 'pollworker':
          return { status, user, card: cardStorage };

        case 'voter':
          return { status, user, card: cardStorage };

        /* istanbul ignore next - compile time check for completeness */
        default:
          return throwIllegalValue(user, 'role');
      }
    }

    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(auth, 'status');
  }
}

// Some useful type guards for checking who's logged in

export function isSuperadminAuth(
  auth: SmartcardAuth
): auth is SuperadminLoggedInAuth {
  return auth.status === 'logged_in' && auth.user.role === 'superadmin';
}

export function isAdminAuth(auth: SmartcardAuth): auth is AdminLoggedInAuth {
  return auth.status === 'logged_in' && auth.user.role === 'admin';
}

export function isPollworkerAuth(
  auth: SmartcardAuth
): auth is PollworkerLoggedInAuth {
  return auth.status === 'logged_in' && auth.user.role === 'pollworker';
}

export function isVoterAuth(auth: SmartcardAuth): auth is VoterLoggedInAuth {
  return auth.status === 'logged_in' && auth.user.role === 'voter';
}
