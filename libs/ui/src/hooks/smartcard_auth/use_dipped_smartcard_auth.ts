import {
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import { DippedSmartcardAuth, err, ok, Result, User } from '@votingworks/types';
import { LoggedOut } from '@votingworks/types/src/smartcard_auth/dipped_smartcard_auth';
import { assert, Card, CardApi, throwIllegalValue } from '@votingworks/utils';
import deepEqual from 'deep-eql';
import { useEffect, useReducer } from 'react';
import useInterval from 'use-interval';
import { useLock } from '../use_lock';
import { usePrevious } from '../use_previous';
import {
  buildCardStorage,
  CARD_POLLING_INTERVAL,
  parseUserFromCard,
} from './auth_helpers';

export interface UseDippedSmartcardAuthArgs {
  cardApi: Card;
  logger?: Logger;
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
  card: CardApi;
  auth: AuthState;
}

type SmartcardAuthAction =
  | {
      type: 'card_read';
      card: CardApi;
    }
  | { type: 'check_passcode'; passcode: string }
  | { type: 'log_out' }
  | { type: 'bootstrap_admin_session'; electionHash: string };

function validateCardUser(user?: User): Result<void, LoggedOut['reason']> {
  if (!user) return err('invalid_user_on_card');
  if (!(user.role === 'admin' || user.role === 'superadmin')) {
    return err('user_role_not_allowed');
  }
  return ok();
}

function smartcardAuthReducer(
  previousState: SmartcardAuthState,
  action: SmartcardAuthAction
): SmartcardAuthState {
  switch (action.type) {
    case 'card_read': {
      const newAuth = ((): AuthState => {
        switch (previousState.auth.status) {
          case 'logged_out': {
            switch (action.card.status) {
              case 'no_card':
                return { status: 'logged_out', reason: 'machine_locked' };

              case 'error':
                return { status: 'logged_out', reason: 'card_error' };

              case 'ready': {
                const user = parseUserFromCard(action.card);
                const validationResult = validateCardUser(user);
                if (validationResult.isOk()) {
                  assert(
                    user &&
                      (user.role === 'superadmin' || user.role === 'admin')
                  );
                  // TODO: This case can be removed once superadmin cards have passcodes
                  if (user.role === 'superadmin') {
                    return { status: 'remove_card', user };
                  }
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
                return throwIllegalValue(action.card, 'status');
            }
          }

          case 'checking_passcode': {
            if (action.card.status === 'no_card') {
              return { status: 'logged_out', reason: 'machine_locked' };
            }
            return previousState.auth;
          }

          case 'remove_card': {
            if (action.card.status === 'no_card') {
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
            ? { status: 'remove_card', user: previousState.auth.user }
            : { ...previousState.auth, wrongPasscodeEnteredAt: new Date() },
      };
    }

    case 'log_out':
      return {
        ...previousState,
        auth: { status: 'logged_out', reason: 'machine_locked' },
      };

    case 'bootstrap_admin_session':
      return {
        ...previousState,
        auth: {
          status: 'logged_in',
          user: {
            role: 'admin',
            electionHash: action.electionHash,
            passcode: '000000',
          },
        },
      };

    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(action, 'type');
  }
}

function useDippedSmartcardAuthBase({
  cardApi,
}: UseDippedSmartcardAuthArgs): DippedSmartcardAuth.Auth {
  const [{ card, auth }, dispatch] = useReducer(smartcardAuthReducer, {
    card: { status: 'no_card' },
    auth: { status: 'logged_out', reason: 'machine_locked' },
  });
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
      return {
        ...auth,
        bootstrapAuthenticatedAdminSession: (electionHash: string) =>
          dispatch({ type: 'bootstrap_admin_session', electionHash }),
      };

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
      const cardStorage =
        card.status === 'ready'
          ? buildCardStorage(card, cardApi, cardWriteLock)
          : undefined;

      switch (user.role) {
        case 'superadmin': {
          return {
            status,
            user,
            card: cardStorage,
            logOut: () => dispatch({ type: 'log_out' }),
          };
        }

        case 'admin': {
          return {
            status,
            user,
            card: cardStorage,
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
    bootstrapAuthenticatedAdminSession: /* istanbul ignore next */ () =>
      undefined,
  },
  auth: DippedSmartcardAuth.Auth
) {
  switch (previousAuth.status) {
    case 'logged_out': {
      if (auth.status === 'logged_in') {
        await logger.log(LogEventId.AuthLogin, auth.user.role, {
          disposition: LogDispositionStandardTypes.Success,
        });
      } else if (
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
 * Only superadmins and admins are supported.
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
