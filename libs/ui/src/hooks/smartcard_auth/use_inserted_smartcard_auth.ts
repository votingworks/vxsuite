import {
  UserRole,
  User,
  safeParseJson,
  ok,
  err,
  Card,
  CardSummary,
  CardSummaryReady,
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
  Optional,
} from '@votingworks/types';
import { assert, throwIllegalValue, utcTimestamp } from '@votingworks/utils';
import { useEffect, useReducer, useState } from 'react';
import useInterval from 'use-interval';
import deepEqual from 'deep-eql';
import {
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import { Lock, useLock } from '../use_lock';
import {
  buildCardStorage,
  CARD_POLLING_INTERVAL,
  parseUserFromCardSummary,
} from './auth_helpers';
import { usePrevious } from '../use_previous';

export const VOTER_CARD_EXPIRATION_SECONDS = 60 * 60; // 1 hour

interface InsertedSmartcardAuthScope {
  allowElectionManagersToAccessMachinesConfiguredForOtherElections?: boolean;
  electionDefinition?: ElectionDefinition;
  precinct?: PrecinctSelection;
}

export interface UseInsertedSmartcardAuthArgs {
  allowedUserRoles: UserRole[];
  cardApi: Card;
  logger?: Logger;
  scope: InsertedSmartcardAuthScope;
}

type AuthState =
  | Pick<InsertedSmartcardAuth.LoggedOut, 'status' | 'reason' | 'cardUserRole'>
  | Pick<
      InsertedSmartcardAuth.CheckingPasscode,
      'status' | 'user' | 'wrongPasscodeEnteredAt'
    >
  | Pick<InsertedSmartcardAuth.LoggedIn, 'status' | 'user'>;

interface InsertedSmartcardAuthState {
  cardSummary: CardSummary;
  auth: AuthState;
}

type InsertedSmartcardAuthAction =
  | {
      type: 'card_read';
      cardSummary: CardSummary;
    }
  | {
      type: 'check_passcode';
      passcode: string;
    };

function validateCardUser(
  previousAuth: AuthState,
  user: Optional<User>,
  allowedUserRoles: UserRole[],
  scope: InsertedSmartcardAuthScope
): Result<void, InsertedSmartcardAuth.LoggedOut['reason']> {
  if (!user) {
    return err('invalid_user_on_card');
  }

  if (!allowedUserRoles.includes(user.role)) {
    return err('user_role_not_allowed');
  }

  if (user.role === 'election_manager') {
    if (!scope.electionDefinition) {
      return ok();
    }
    if (
      user.electionHash !== scope.electionDefinition.electionHash &&
      !scope.allowElectionManagersToAccessMachinesConfiguredForOtherElections
    ) {
      return err('election_manager_wrong_election');
    }
  }

  if (user.role === 'poll_worker') {
    if (!scope.electionDefinition) {
      return err('machine_not_configured');
    }
    if (user.electionHash !== scope.electionDefinition.electionHash) {
      return err('poll_worker_wrong_election');
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

  return ok();
}

function smartcardAuthReducer(
  allowedUserRoles: UserRole[],
  scope: InsertedSmartcardAuthScope
) {
  return (
    previousState: InsertedSmartcardAuthState,
    action: InsertedSmartcardAuthAction
  ): InsertedSmartcardAuthState => {
    switch (action.type) {
      case 'card_read': {
        const newAuth = ((): AuthState => {
          switch (action.cardSummary.status) {
            case 'no_card':
              return { status: 'logged_out', reason: 'no_card' };
            case 'error':
              return { status: 'logged_out', reason: 'card_error' };
            case 'ready': {
              const user = parseUserFromCardSummary(action.cardSummary);
              const validationResult = validateCardUser(
                previousState.auth,
                user,
                allowedUserRoles,
                scope
              );
              if (validationResult.isOk()) {
                assert(user);
                if (previousState.auth.status === 'logged_out') {
                  if (
                    user.role === 'system_administrator' ||
                    user.role === 'election_manager'
                  ) {
                    return { status: 'checking_passcode', user };
                  }
                  return { status: 'logged_in', user };
                }
                return previousState.auth;
              }
              return {
                status: 'logged_out',
                reason: validationResult.err(),
                cardUserRole: user?.role,
              };
            }
            /* istanbul ignore next - compile time check for completeness */
            default:
              throwIllegalValue(action.cardSummary, 'status');
          }
        })();

        // Optimization: if the card and auth state didn't change, then we can
        // return the previous state, which will cause React to not rerender.
        // https://reactjs.org/docs/hooks-reference.html#bailing-out-of-a-dispatch
        const newState: InsertedSmartcardAuthState = {
          auth: newAuth,
          cardSummary: action.cardSummary,
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
              : {
                  ...previousState.auth,
                  wrongPasscodeEnteredAt: new Date(),
                },
        };
      }

      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(action, 'type');
    }
  };
}

function buildPollWorkerCardlessVoterProps(
  activatedCardlessVoter: CardlessVoterUser | undefined,
  setActivatedCardlessVoter: (cardlessVoter?: CardlessVoterUser) => void
): Pick<
  InsertedSmartcardAuth.PollWorkerLoggedIn,
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
  cardSummary: CardSummaryReady,
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
      assert(cardSummary.shortValue !== undefined);
      const cardData = safeParseJson(
        cardSummary.shortValue,
        VoterCardDataSchema
      ).ok();
      assert(cardData);
      return writeVoterCardData({
        ...cardData,
        uz: utcTimestamp(),
      });
    },

    markCardPrinted: () => {
      assert(cardSummary.shortValue !== undefined);
      const cardData = safeParseJson(
        cardSummary.shortValue,
        VoterCardDataSchema
      ).ok();
      assert(cardData);
      return writeVoterCardData({
        ...cardData,
        bp: utcTimestamp(),
      });
    },
  };
}

function useInsertedSmartcardAuthBase({
  cardApi,
  allowedUserRoles,
  scope,
}: UseInsertedSmartcardAuthArgs): InsertedSmartcardAuth.Auth {
  const [{ cardSummary, auth }, dispatch] = useReducer(
    smartcardAuthReducer(allowedUserRoles, scope),
    {
      cardSummary: { status: 'no_card' },
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
      const newCardSummary = await cardApi.readSummary();
      dispatch({ type: 'card_read', cardSummary: newCardSummary });
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
      assert(cardSummary.status === 'ready');
      const { status, user } = auth;
      const cardStorage = buildCardStorage(cardSummary, cardApi, cardWriteLock);
      switch (user.role) {
        case 'system_administrator': {
          return { status, user, card: cardStorage };
        }

        case 'election_manager': {
          return { status, user, card: cardStorage };
        }

        case 'poll_worker': {
          return {
            status,
            user,
            card: cardStorage,
            ...buildPollWorkerCardlessVoterProps(
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
            ...buildVoterCardMethods(cardSummary, cardApi, cardWriteLock),
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

async function logAuthEvents(
  logger: Logger,
  previousAuth: InsertedSmartcardAuth.Auth = {
    status: 'logged_out',
    reason: 'no_card',
  },
  auth: InsertedSmartcardAuth.Auth
) {
  switch (previousAuth.status) {
    case 'logged_out': {
      if (auth.status === 'logged_in') {
        await logger.log(LogEventId.AuthLogin, auth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
        });
      } else if (
        previousAuth.reason === 'no_card' &&
        auth.status === 'logged_out' &&
        auth.reason !== 'no_card'
      ) {
        await logger.log(LogEventId.AuthLogin, auth.cardUserRole ?? 'unknown', {
          disposition: LogDispositionStandardTypes.Failure,
          message: `User failed login: ${auth.reason}`,
          reason: auth.reason,
        });
      }
      return;
    }

    case 'checking_passcode': {
      if (auth.status === 'logged_out') {
        await logger.log(LogEventId.AuthPasscodeEntry, previousAuth.user.role, {
          disposition: LogDispositionStandardTypes.Failure,
          message: 'User canceled passcode entry.',
        });
      } else if (auth.status === 'logged_in') {
        await logger.log(LogEventId.AuthPasscodeEntry, auth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User entered correct passcode.',
        });
        await logger.log(LogEventId.AuthLogin, auth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
        });
      } else if (auth.status === 'checking_passcode') {
        if (
          auth.wrongPasscodeEnteredAt &&
          previousAuth.wrongPasscodeEnteredAt !== auth.wrongPasscodeEnteredAt
        ) {
          await logger.log(
            LogEventId.AuthPasscodeEntry,
            previousAuth.user.role,
            {
              disposition: LogDispositionStandardTypes.Failure,
              message: 'User entered incorrect passcode.',
            }
          );
        }
      }
      return;
    }

    case 'logged_in': {
      if (auth.status === 'logged_out') {
        await logger.log(LogEventId.AuthLogout, previousAuth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: `User logged out: ${auth.reason}.`,
          reason: auth.reason,
        });
      } else if (auth.status === 'logged_in') {
        if (auth.user.role !== previousAuth.user.role) {
          await logger.log(LogEventId.AuthLogin, auth.user.role, {
            disposition: LogDispositionStandardTypes.Success,
          });
        }
      }
      return;
    }

    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(previousAuth, 'status');
  }
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
export function useInsertedSmartcardAuth(
  args: UseInsertedSmartcardAuthArgs
): InsertedSmartcardAuth.Auth {
  const auth = useInsertedSmartcardAuthBase(args);
  const previousAuth = usePrevious(auth);
  const { logger } = args;

  useEffect(() => {
    if (logger) {
      void logAuthEvents(logger, previousAuth, auth);
    }
  }, [logger, previousAuth, auth]);

  return auth;
}
