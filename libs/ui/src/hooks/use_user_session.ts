import {
  UserRole,
  ElectionDefinition,
  Optional,
  UserSession,
} from '@votingworks/types';
import {
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import { useCallback, useEffect, useState } from 'react';
import deepEqual from 'deep-eql';
import { assert, throwIllegalValue } from '@votingworks/utils';
import { Smartcard } from './use_smartcard';
import { usePrevious } from './use_previous';

export interface UseUserSessionProps {
  smartcard: Smartcard;
  electionDefinition?: ElectionDefinition;
  persistAuthentication: boolean; // Persist an authenticated admin session when the admin card is removed.
  bypassAuthentication?: boolean; // Always maintain an authenticated admin session for frontends persisting authentication, and remove the need to authenticate admin cards for non-persisting admins.
  validUserTypes: UserRole[]; // List of user types that can authenticate into the given frontend.
  logger: Logger;
}

export interface UseUserSessionResult {
  currentUserSession?: UserSession;
  attemptToAuthenticateAdminUser: (passcode: string) => boolean;
  lockMachine: () => void;
  bootstrapAuthenticatedAdminSession: () => void;
}

/**
 * React hook for getting the current user session and authentication status.
 * Pollworker sessions will only be authenticated if the election hash on the smartcard matches the election definition provided.
 * An admin card that does not have a pin configured will be automatically authenticated.
 *
 * @param persistAuthentication When the property persistAuthentication is true, the app will keep an authenticated admin session
 * after the admin card is removed. And any other cards seen by the card reader when there is an authenticated admin
 * session will be ignored. When persistAuthentication is false, the card will need to be present in the card reader at all
 * times in order to maintain the current user session.
 * @param bypassAuthentication Used to bypass the need to enter a passcode to authenticate admin sessions
 *
 */
export function useUserSession({
  smartcard,
  electionDefinition,
  persistAuthentication,
  bypassAuthentication = false,
  logger,
  validUserTypes,
}: UseUserSessionProps): UseUserSessionResult {
  const [currentUserSession, setCurrentUserSession] = useState<
    Optional<UserSession>
  >();
  const previousUserSession = usePrevious(currentUserSession);
  // Admins must be able to authenticate into all frontends.
  assert(validUserTypes.includes('admin'));

  // Handle logging when the current user session is updated
  useEffect(() => {
    async function logUserSessionUpdate() {
      const previousUserName = previousUserSession?.type ?? 'unknown';
      if (!currentUserSession) {
        await logger.log(LogEventId.UserLoggedOut, previousUserName, {
          disposition: LogDispositionStandardTypes.Success,
        });
        return;
      }
      switch (currentUserSession.type) {
        case 'admin':
          if (currentUserSession.authenticated) {
            await logger.log(LogEventId.UserSessionActivationAttempt, 'admin', {
              disposition: LogDispositionStandardTypes.Success,
              message: 'Authenticated admin session initiated.',
            });
          } else {
            await logger.log(LogEventId.AdminCardInserted, previousUserName, {
              disposition: LogDispositionStandardTypes.NotApplicable,
            });
          }
          return;
        case 'superadmin':
          /* istanbul ignore else - not possible but will be in the future */
          if (currentUserSession.authenticated) {
            await logger.log(
              LogEventId.UserSessionActivationAttempt,
              'superadmin',
              {
                disposition: LogDispositionStandardTypes.Success,
                message:
                  'Superadmin card was insertted and successfully authenticated.',
              }
            );
          }
          return;
        case 'pollworker':
          if (currentUserSession.authenticated) {
            await logger.log(
              LogEventId.UserSessionActivationAttempt,
              'pollworker',
              {
                disposition: LogDispositionStandardTypes.Success,
                message:
                  'Pollworker card with the expected election was inserted and a pollworker session was successfully authenticated.',
              }
            );
          } else {
            await logger.log(
              LogEventId.UserSessionActivationAttempt,
              previousUserName,
              {
                disposition: LogDispositionStandardTypes.Failure,
                message:
                  'Pollworker card inserted with an unexpected election configuration, no pollworker session was authenticated.',
                result: 'Invalid card message displayed to the user.',
                attemptedUserRole: 'pollworker',
              }
            );
          }
          return;
        case 'voter':
          /* istanbul ignore else - not possible to hit this yet but there for completeness */
          if (currentUserSession.authenticated) {
            await logger.log(LogEventId.UserSessionActivationAttempt, 'voter', {
              disposition: LogDispositionStandardTypes.Success,
              message:
                'Voter card  was inserted and a voter session was successfully authenticated.',
            });
          } else {
            await logger.log(
              LogEventId.UserSessionActivationAttempt,
              previousUserName,
              {
                disposition: LogDispositionStandardTypes.Failure,
                message:
                  'Voter card inserted with an unexpected configuration, no voter session was authenticated.',
                result: 'Invalid card message displayed to the user.',
                attemptedUserRole: 'voter',
              }
            );
          }
          return;
        case 'unknown': {
          if (currentUserSession.attemptedUserType) {
            await logger.log(
              LogEventId.UserSessionActivationAttempt,
              'unknown',
              {
                disposition: LogDispositionStandardTypes.Failure,
                message: `Smartcard inserted with invalid user type: ${
                  currentUserSession.attemptedUserType
                }. Only the following users may have access in this application: ${validUserTypes.join(
                  ', '
                )}`,
                result: 'Invalid card message shown to the user.',
                attemptedUserRole: currentUserSession.attemptedUserType,
              }
            );
          } else {
            await logger.log(
              LogEventId.UserSessionActivationAttempt,
              'unknown',
              {
                disposition: LogDispositionStandardTypes.Failure,
                message: 'Smartcard inserted with unrecognized user type.',
                result: 'Invalid card message shown to the user.',
                attemptedUserRole: 'unknown',
              }
            );
          }
          return;
        }
        /* istanbul ignore next - compile time check for completeness */
        default:
          throwIllegalValue(currentUserSession, 'type');
      }
    }
    if (!deepEqual(currentUserSession, previousUserSession)) {
      void logUserSessionUpdate();
    }
  }, [currentUserSession, previousUserSession, logger, validUserTypes]);

  useEffect(() => {
    void (() => {
      setCurrentUserSession((prev) => {
        const previousIsAuthenticatedAdmin =
          prev?.type === 'admin' && prev.authenticated;
        if (bypassAuthentication && !prev && persistAuthentication) {
          return {
            type: 'admin',
            authenticated: true,
          };
        }

        if (smartcard.status === 'ready') {
          if (persistAuthentication && previousIsAuthenticatedAdmin) {
            return prev;
          }
          if (smartcard.data?.t) {
            if (
              smartcard.data.t === 'superadmin' &&
              validUserTypes.includes('superadmin')
            ) {
              return {
                type: smartcard.data.t,
                authenticated: true, // TODO in the future we will have a passcode that is check for super admins
              };
            }
            if (
              smartcard.data.t === 'pollworker' &&
              validUserTypes.includes('pollworker')
            ) {
              const electionHashMatches =
                (electionDefinition &&
                  smartcard.data.h === electionDefinition.electionHash) ??
                false;
              return {
                type: smartcard.data.t,
                authenticated: electionHashMatches,
                isElectionHashValid: electionHashMatches,
              };
            }
            if (smartcard.data.t === 'admin') {
              // TODO check election hash matches election definition (if there is one)
              const adminCardHasNoPin = smartcard.data.p === undefined;
              return {
                type: smartcard.data.t,
                authenticated:
                  bypassAuthentication ||
                  adminCardHasNoPin ||
                  previousIsAuthenticatedAdmin,
              };
            }
            if (
              smartcard.data.t === 'voter' &&
              validUserTypes.includes('voter')
            ) {
              return {
                type: smartcard.data.t,
                authenticated: true,
              };
            }
            return {
              type: 'unknown',
              authenticated: false,
              attemptedUserType: smartcard.data.t,
            };
          }
          // Invalid card type
          return {
            type: 'unknown',
            authenticated: false,
          };
        }
        if (prev && (!persistAuthentication || !previousIsAuthenticatedAdmin)) {
          return undefined;
        }
        return prev;
      });
    })();
  }, [
    bypassAuthentication,
    persistAuthentication,
    smartcard,
    electionDefinition,
    logger,
    validUserTypes,
  ]);

  const attemptToAuthenticateAdminUser = useCallback(
    (passcode: string): boolean => {
      let isAdminCard = false;
      let passcodeMatches = false;
      // The card must be an admin card to authenticate
      if (smartcard.status === 'ready' && smartcard.data?.t === 'admin') {
        isAdminCard = true;
        // There must be an expected passcode on the card to authenticate.
        if (typeof smartcard.data.p === 'string') {
          passcodeMatches = passcode === smartcard.data.p;
        }
      }
      if (isAdminCard) {
        if (passcodeMatches) {
          void logger.log(LogEventId.AdminAuthenticationTwoFactor, 'admin', {
            disposition: LogDispositionStandardTypes.Success,
            message:
              'Admin user successfully authenticated with the correct passcode.',
          });
        } else {
          void logger.log(LogEventId.AdminAuthenticationTwoFactor, 'unknown', {
            disposition: LogDispositionStandardTypes.Failure,
            message:
              'Admin user authentication attempt failed due to invalid passcode entered.',
            result: 'User session not authenticated, user asked to try again.',
          });
        }
        setCurrentUserSession({
          type: 'admin',
          authenticated: passcodeMatches,
        });
      } else {
        void logger.log(
          LogEventId.AdminAuthenticationTwoFactor,
          currentUserSession?.type ?? 'unknown',
          {
            disposition: LogDispositionStandardTypes.Failure,
            message:
              'Admin user authentication attempt failed as the current smartcard is not an admin card.',
            result: 'User session not authenticated, user asked to try again.',
          }
        );
      }
      return isAdminCard && passcodeMatches;
    },
    [smartcard, logger, currentUserSession]
  );

  const lockMachine = useCallback(() => {
    if (!bypassAuthentication && currentUserSession) {
      void logger.log(LogEventId.MachineLocked, currentUserSession.type, {
        disposition: LogDispositionStandardTypes.Success,
      });
      setCurrentUserSession(undefined);
    }
  }, [bypassAuthentication, currentUserSession, logger]);

  const bootstrapAuthenticatedAdminSession = useCallback(() => {
    setCurrentUserSession({ type: 'admin', authenticated: true });
  }, []);

  return {
    currentUserSession,
    attemptToAuthenticateAdminUser,
    lockMachine,
    bootstrapAuthenticatedAdminSession,
  };
}
