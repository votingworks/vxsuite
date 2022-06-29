import {
  UserRole,
  User,
  safeParseJson,
  ok,
  err,
  ElectionDefinition,
  Result,
  wrapException,
  getBallotStyle,
  getPrecinctById,
  PrecinctSelectionKind,
  PrecinctSelection,
  VoterCardData,
  VoterCardDataSchema,
  PrecinctId,
  BallotStyleId,
  CardlessVoterUser,
  InsertedSmartcardAuth,
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
import { Lock, useLock } from '../use_lock';
import {
  buildCardStorage,
  CARD_POLLING_INTERVAL,
  parseUserFromCard,
} from './auth_helpers';

export const VOTER_CARD_EXPIRATION_SECONDS = 60 * 60; // 1 hour

// Types for the useInsertedSmartcardAuth hook
export interface AuthScope {
  electionDefinition?: ElectionDefinition;
  precinct?: PrecinctSelection;
}

export interface UseInsertedSmartcardAuthArgs {
  cardApi: Card;
  allowedUserRoles: UserRole[];
  scope: AuthScope;
}

type AuthState =
  | Pick<InsertedSmartcardAuth.LoggedOut, 'status' | 'reason'>
  | Pick<
      InsertedSmartcardAuth.CheckingPasscode,
      'status' | 'user' | 'wrongPasscodeEntered'
    >
  | Pick<InsertedSmartcardAuth.LoggedIn, 'status' | 'user'>;

interface InsertedSmartcardAuthState {
  card: CardApi;
  auth: AuthState;
}

type InsertedSmartcardAuthAction =
  | {
      type: 'card_read';
      card: CardApi;
    }
  | {
      type: 'check_passcode';
      passcode: string;
    };

function validateCardUser(
  previousAuth: AuthState,
  card: CardApiReady,
  allowedUserRoles: UserRole[],
  scope: AuthScope
): Result<User, InsertedSmartcardAuth.LoggedOut['reason']> {
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
    previousState: InsertedSmartcardAuthState,
    action: InsertedSmartcardAuthAction
  ): InsertedSmartcardAuthState => {
    switch (action.type) {
      case 'card_read': {
        const newAuth = ((): AuthState => {
          switch (action.card.status) {
            case 'no_card':
              return { status: 'logged_out', reason: 'no_card' };
            case 'error':
              return { status: 'logged_out', reason: 'card_error' };
            case 'ready': {
              const userResult = validateCardUser(
                previousState.auth,
                action.card,
                allowedUserRoles,
                scope
              );
              if (userResult.isOk()) {
                const user = userResult.ok();
                if (previousState.auth.status === 'logged_out') {
                  if (user.role === 'admin') {
                    return { status: 'checking_passcode', user };
                  }
                  return { status: 'logged_in', user };
                }
                return previousState.auth;
              }
              return { status: 'logged_out', reason: userResult.err() };
            }
            /* istanbul ignore next - compile time check for completeness */
            default:
              throwIllegalValue(action.card, 'status');
          }
        })();

        // Optimization: if the card and auth state didn't change, then we can
        // return the previous state, which will cause React to not rerender.
        // https://reactjs.org/docs/hooks-reference.html#bailing-out-of-a-dispatch
        const newState: InsertedSmartcardAuthState = {
          auth: newAuth,
          card: action.card,
        };
        return deepEqual(newState, previousState) ? previousState : newState;
      }

      case 'check_passcode': {
        assert(previousState.auth.status === 'checking_passcode');
        return {
          ...previousState,
          auth:
            action.passcode === previousState.auth.user.passcode
              ? { status: 'logged_in', user: previousState.auth.user }
              : { ...previousState.auth, wrongPasscodeEntered: true },
        };
      }

      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(action, 'type');
    }
  };
}

function buildPollworkerCardlessVoterProps(
  activatedCardlessVoter: CardlessVoterUser | undefined,
  setActivatedCardlessVoter: (cardlessVoter?: CardlessVoterUser) => void
): Pick<
  InsertedSmartcardAuth.PollworkerLoggedIn,
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
): Pick<
  InsertedSmartcardAuth.VoterLoggedIn,
  'markCardVoided' | 'markCardPrinted'
> {
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
 * Authenticates a user based on the currently inserted smartcard.
 *
 * For this type of authentication, the card must be inserted the entire time
 * the user is using the app.
 *
 * If a card is inserted, an auth session for the user represented by the
 * card, as well as an interface for reading/writing data to the card for
 * storage. If no card is inserted or the card is invalid, returns a logged out
 * state with a reason.
 */
export function useInsertedSmartcardAuth({
  cardApi,
  allowedUserRoles,
  scope,
}: UseInsertedSmartcardAuthArgs): InsertedSmartcardAuth.Auth {
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
    case 'logged_out': {
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
    }

    case 'checking_passcode':
      return {
        ...auth,
        checkPasscode: (passcode: string) =>
          dispatch({ type: 'check_passcode', passcode }),
      };

    case 'logged_in': {
      assert(card.status === 'ready');
      const { status, user } = auth;
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
