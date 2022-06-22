import {
  UserRole,
  SmartcardAuth,
  User,
  safeParseJson,
  AnyCardDataSchema,
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
  wrapException,
  getBallotStyle,
  getPrecinctById,
  PrecinctSelectionKind,
  PrecinctSelection,
  VoterCardData,
  VoterCardDataSchema,
  Optional,
  PrecinctId,
  BallotStyleId,
  CardlessVoterUser,
  CardlessVoterLoggedInAuth,
} from '@votingworks/types';
import {
  assert,
  Card,
  CardApi,
  CardApiReady,
  throwIllegalValue,
  utcTimestamp,
} from '@votingworks/utils';
import { useReducer, useState } from 'react';
import useInterval from 'use-interval';
import deepEqual from 'deep-eql';
import { CARD_POLLING_INTERVAL } from './use_smartcard';
import { Lock, useLock } from './use_lock';

export const VOTER_CARD_EXPIRATION_SECONDS = 60 * 60; // 1 hour

// Below, we define some useful type guards for checking who's logged in.

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

export function isCardlessVoterAuth(
  auth: SmartcardAuth
): auth is CardlessVoterLoggedInAuth {
  return auth.status === 'logged_in' && auth.user.role === 'cardless_voter';
}

// Types for the useSmartcardAuth hook
interface AuthScope {
  electionDefinition?: ElectionDefinition;
  precinct?: PrecinctSelection;
}

export interface UseSmartcardAuthArgs {
  cardApi: Card;
  allowedUserRoles: UserRole[];
  scope: AuthScope;
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

function parseUserFromCard(card: CardApiReady): Optional<User> {
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

function attemptLogin(
  previousAuth: AuthState,
  card: CardApiReady,
  allowedUserRoles: UserRole[],
  scope: AuthScope
): Result<User, LoggedOutAuth['reason']> {
  const user = parseUserFromCard(card);
  if (!user) return err('invalid_user_on_card');
  if (!allowedUserRoles.includes(user.role)) {
    return err('user_role_not_allowed');
  }

  if (user.role === 'pollworker') {
    if (!scope.electionDefinition) return err('machine_not_configured');
    if (user.electionHash !== scope.electionDefinition.electionHash) {
      return err('pollworker_wrong_election');
    }
  }

  if (user.role === 'voter') {
    if (!scope.electionDefinition || !scope.precinct) {
      return err('machine_not_configured');
    }
    if (utcTimestamp() >= user.createdAt + VOTER_CARD_EXPIRATION_SECONDS) {
      return err('voter_card_expired');
    }
    if (user.voidedAt) {
      return err('voter_card_voided');
    }
    // After a voter's ballot is printed, we don't want to log them out until
    // they remove their card
    if (user.ballotPrintedAt && previousAuth.status !== 'logged_in') {
      return err('voter_card_printed');
    }
    const ballotStyle = getBallotStyle({
      election: scope.electionDefinition.election,
      ballotStyleId: user.ballotStyleId,
    });
    const precinct = getPrecinctById({
      election: scope.electionDefinition.election,
      precinctId: user.precinctId,
    });
    if (!ballotStyle || !precinct) {
      return err('voter_wrong_election');
    }
    if (
      scope.precinct.kind === PrecinctSelectionKind.SinglePrecinct &&
      precinct.id !== scope.precinct.precinctId
    ) {
      return err('voter_wrong_precinct');
    }
  }
  return ok(user);
}

function smartcardAuthReducer(allowedUserRoles: UserRole[], scope: AuthScope) {
  return (
    previousState: SmartcardAuthState,
    action: SmartcardAuthAction
  ): SmartcardAuthState => {
    switch (action.type) {
      case 'card_read': {
        const newAuth = ((): AuthState => {
          switch (action.card.status) {
            case 'no_card':
              return { status: 'logged_out', reason: 'no_card' };
            case 'error':
              return { status: 'logged_out', reason: 'card_error' };
            case 'ready': {
              const loginResult = attemptLogin(
                previousState.auth,
                action.card,
                allowedUserRoles,
                scope
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

        // Optimization: if the card and auth state didn't change, then we can
        // return the previous state, which will cause React to not rerender.
        // https://reactjs.org/docs/hooks-reference.html#bailing-out-of-a-dispatch
        const newState: SmartcardAuthState = {
          auth: newAuth,
          card: action.card,
        };
        return deepEqual(newState, previousState) ? previousState : newState;
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

function buildPollworkerCardlessVoterProps(
  activatedCardlessVoter: CardlessVoterUser | undefined,
  setActivatedCardlessVoter: (cardlessVoter?: CardlessVoterUser) => void
): Pick<
  PollworkerLoggedInAuth,
  'activateCardlessVoter' | 'deactivateCardlessVoter' | 'activatedCardlessVoter'
> {
  return {
    activateCardlessVoter: (
      precinctId: PrecinctId,
      ballotStyleId: BallotStyleId
    ) => {
      setActivatedCardlessVoter({
        role: 'cardless_voter',
        precinctId,
        ballotStyleId,
      });
    },
    deactivateCardlessVoter: () => {
      setActivatedCardlessVoter(undefined);
    },
    activatedCardlessVoter,
  };
}

function buildVoterCardMethods(
  card: CardApiReady,
  cardApi: Card,
  cardWriteLock: Lock
): Pick<VoterLoggedInAuth, 'markCardVoided' | 'markCardPrinted'> {
  async function writeVoterCardData(
    cardData: VoterCardData
  ): Promise<Result<void, Error>> {
    if (!cardWriteLock.lock()) {
      return err(new Error('Card write in progress'));
    }
    try {
      await cardApi.writeShortValue(JSON.stringify(cardData));
      return ok();
    } catch (error) {
      return wrapException(error);
    } finally {
      cardWriteLock.unlock();
    }
  }

  return {
    markCardVoided: () => {
      assert(card.shortValue !== undefined);
      const cardData = safeParseJson(card.shortValue, VoterCardDataSchema).ok();
      assert(cardData);
      return writeVoterCardData({
        ...cardData,
        uz: utcTimestamp(),
      });
    },

    markCardPrinted: () => {
      assert(card.shortValue !== undefined);
      const cardData = safeParseJson(card.shortValue, VoterCardDataSchema).ok();
      assert(cardData);
      return writeVoterCardData({
        ...cardData,
        bp: utcTimestamp(),
      });
    },
  };
}

/**
 * Polls the smartcard reader and returns an auth session based on the inserted
 * card. If a card is inserted, an auth session for the user represented by the
 * card, as well as an interface for reading/writing data to the card for
 * storage. If no card is inserted or the card is invalid, returns a logged out
 * state with a reason.
 */
export function useSmartcardAuth({
  cardApi,
  allowedUserRoles,
  scope,
}: UseSmartcardAuthArgs): SmartcardAuth {
  const [{ card, auth }, dispatch] = useReducer(
    smartcardAuthReducer(allowedUserRoles, scope),
    {
      card: { status: 'no_card' },
      auth: { status: 'logged_out', reason: 'no_card' },
    }
  );
  // Store cardless voter session separately from the smartcard auth, since it
  // changes independently of the card.
  const [activatedCardlessVoter, setActivatedCardlessVoter] = useState<
    CardlessVoterUser | undefined
  >();
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
      if (
        auth.reason === 'no_card' &&
        activatedCardlessVoter &&
        allowedUserRoles.includes('cardless_voter')
      ) {
        return {
          status: 'logged_in',
          user: activatedCardlessVoter,
          logOut: () => setActivatedCardlessVoter(undefined),
        };
      }
      return auth;

    case 'logged_in': {
      const { status, user } = auth;
      assert(card.status === 'ready');
      const cardStorage = buildCardStorage(card, cardApi, cardWriteLock);
      switch (user.role) {
        case 'superadmin': {
          return { status, user, card: cardStorage };
        }

        case 'admin': {
          return { status, user, card: cardStorage };
        }

        case 'pollworker': {
          return {
            status,
            user,
            card: cardStorage,
            ...buildPollworkerCardlessVoterProps(
              activatedCardlessVoter,
              setActivatedCardlessVoter
            ),
          };
        }

        case 'voter': {
          return {
            status,
            user,
            card: cardStorage,
            ...buildVoterCardMethods(card, cardApi, cardWriteLock),
          };
        }

        /* istanbul ignore next */
        case 'cardless_voter':
          throw new Error('Cardless voter can never log in with card');

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
