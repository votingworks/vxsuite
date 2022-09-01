import {
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import {
  Card,
  CardSummary,
  DippedSmartcardAuth,
  ElectionDefinition,
  err,
  ok,
  Optional,
  Result,
  User,
} from '@votingworks/types';
import { LoggedOut } from '@votingworks/types/src/smartcard_auth/dipped_smartcard_auth';
import { assert, throwIllegalValue } from '@votingworks/utils';
import deepEqual from 'deep-eql';
import { useEffect, useReducer } from 'react';
import useInterval from 'use-interval';
import { useLock } from '../use_lock';
import { usePrevious } from '../use_previous';
import {
  buildCardProgramming,
  buildCardStorage,
  CARD_POLLING_INTERVAL,
  parseUserFromCardSummary,
} from './auth_helpers';

interface DippedSmartcardAuthScope {
  allowElectionManagersToAccessUnconfiguredMachines?: boolean;
  electionDefinition?: ElectionDefinition;
}

export interface UseDippedSmartcardAuthArgs {
  cardApi: Card;
  logger?: Logger;
  scope: DippedSmartcardAuthScope;
}

type AuthState =
  | Pick<DippedSmartcardAuth.LoggedOut, 'status' | 'reason' | 'cardUserRole'>
  | Pick<
      DippedSmartcardAuth.CheckingPasscode,
      'status' | 'user' | 'wrongPasscodeEnteredAt'
    >
  | Pick<DippedSmartcardAuth.RemoveCard, 'status' | 'user'>
  | Pick<DippedSmartcardAuth.LoggedIn, 'status' | 'user'>;

interface SmartcardAuthState {
  cardSummary: CardSummary;
  auth: AuthState;
}

type SmartcardAuthAction =
  | {
      type: 'card_read';
      cardSummary: CardSummary;
    }
  | { type: 'check_passcode'; passcode: string }
  | { type: 'log_out' };

function validateCardUser(
  user: Optional<User>,
  scope: DippedSmartcardAuthScope
): Result<void, LoggedOut['reason']> {
  if (!user) {
    return err('invalid_user_on_card');
  }

  if (!['system_administrator', 'election_manager'].includes(user.role)) {
    return err('user_role_not_allowed');
  }

  if (user.role === 'election_manager') {
    if (!scope.electionDefinition) {
      return scope.allowElectionManagersToAccessUnconfiguredMachines
        ? ok()
        : err('machine_not_configured');
    }
    if (user.electionHash !== scope.electionDefinition.electionHash) {
      return err('election_manager_wrong_election');
    }
  }

  return ok();
}

function smartcardAuthReducer(scope: DippedSmartcardAuthScope) {
  return (
    previousState: SmartcardAuthState,
    action: SmartcardAuthAction
  ): SmartcardAuthState => {
    switch (action.type) {
      case 'card_read': {
        const newAuth = ((): AuthState => {
          switch (previousState.auth.status) {
            case 'logged_out': {
              switch (action.cardSummary.status) {
                case 'no_card':
                  return { status: 'logged_out', reason: 'machine_locked' };

                case 'error':
                  return { status: 'logged_out', reason: 'card_error' };

                case 'ready': {
                  const user = parseUserFromCardSummary(action.cardSummary);
                  const validationResult = validateCardUser(user, scope);
                  if (validationResult.isOk()) {
                    assert(
                      user &&
                        (user.role === 'system_administrator' ||
                          user.role === 'election_manager')
                    );
                    return { status: 'checking_passcode', user };
                  }
                  return {
                    status: 'logged_out',
                    reason: validationResult.err(),
                    cardUserRole: user?.role,
                  };
                }

                /* istanbul ignore next - compile time check for completeness */
                default:
                  return throwIllegalValue(action.cardSummary, 'status');
              }
            }

            case 'checking_passcode': {
              if (action.cardSummary.status === 'no_card') {
                return { status: 'logged_out', reason: 'machine_locked' };
              }
              return previousState.auth;
            }

            case 'remove_card': {
              if (action.cardSummary.status === 'no_card') {
                return { status: 'logged_in', user: previousState.auth.user };
              }
              return previousState.auth;
            }

            case 'logged_in':
              return previousState.auth;

            /* istanbul ignore next - compile time check for completeness */
            default:
              throwIllegalValue(previousState.auth, 'status');
          }
        })();

        // Optimization: if the card and auth state didn't change, then we can
        // return the previous state, which will cause React to not rerender.
        // https://reactjs.org/docs/hooks-reference.html#bailing-out-of-a-dispatch
        const newState: SmartcardAuthState = {
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
              ? { status: 'remove_card', user: previousState.auth.user }
              : { ...previousState.auth, wrongPasscodeEnteredAt: new Date() },
        };
      }

      case 'log_out':
        return {
          ...previousState,
          auth: { status: 'logged_out', reason: 'machine_locked' },
        };

      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(action, 'type');
    }
  };
}

function useDippedSmartcardAuthBase({
  cardApi,
  logger,
  scope,
}: UseDippedSmartcardAuthArgs): DippedSmartcardAuth.Auth {
  const [{ cardSummary, auth }, dispatch] = useReducer(
    smartcardAuthReducer(scope),
    {
      cardSummary: { status: 'no_card' },
      auth: { status: 'logged_out', reason: 'machine_locked' },
    }
  );
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
    case 'logged_out':
      return auth;

    case 'checking_passcode': {
      return {
        ...auth,
        checkPasscode: (passcode: string) =>
          dispatch({ type: 'check_passcode', passcode }),
      };
    }

    case 'remove_card': {
      return auth;
    }

    case 'logged_in': {
      const { status, user } = auth;

      switch (user.role) {
        case 'system_administrator': {
          return {
            status,
            user,
            card:
              cardSummary.status === 'ready'
                ? {
                    ...buildCardStorage(cardSummary, cardApi, cardWriteLock),
                    ...buildCardProgramming(
                      cardSummary,
                      cardApi,
                      cardWriteLock,
                      logger
                    ),
                  }
                : cardSummary.status,
            logOut: () => dispatch({ type: 'log_out' }),
          };
        }

        case 'election_manager': {
          return {
            status,
            user,
            card:
              cardSummary.status === 'ready'
                ? buildCardStorage(cardSummary, cardApi, cardWriteLock)
                : cardSummary.status,
            logOut: () => dispatch({ type: 'log_out' }),
          };
        }

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
  previousAuth: DippedSmartcardAuth.Auth = {
    status: 'logged_out',
    reason: 'machine_locked',
  },
  auth: DippedSmartcardAuth.Auth
) {
  switch (previousAuth.status) {
    case 'logged_out': {
      if (
        previousAuth.reason === 'machine_locked' &&
        auth.status === 'logged_out' &&
        auth.reason !== 'machine_locked'
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
      } else if (auth.status === 'remove_card') {
        await logger.log(LogEventId.AuthPasscodeEntry, auth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User entered correct passcode.',
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

    case 'remove_card': {
      if (auth.status === 'logged_in') {
        await logger.log(LogEventId.AuthLogin, auth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
        });
      }
      return;
    }

    case 'logged_in': {
      if (auth.status === 'logged_out') {
        await logger.log(LogEventId.AuthLogout, previousAuth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
        });
      }
      return;
    }

    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(previousAuth, 'status');
  }
}

/**
 * Authenticates a user based on a smartcard dip (insertion and removal).
 *
 * For this type of authentication, the card must be removed before the user is
 * logged in. Once logged in, further card insertions won't change the auth state.
 * To log out, the user must manually lock the machine.
 *
 * Only super admins and admins are supported.
 */
export function useDippedSmartcardAuth(
  args: UseDippedSmartcardAuthArgs
): DippedSmartcardAuth.Auth {
  const auth = useDippedSmartcardAuthBase(args);
  const previousAuth = usePrevious(auth);
  const { logger } = args;

  useEffect(() => {
    if (logger) {
      void logAuthEvents(logger, previousAuth, auth);
    }
  }, [logger, auth, previousAuth]);

  return auth;
}
