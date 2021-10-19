import { ElectionDefinition, Optional, UserSession } from '@votingworks/types';
import { useCallback, useEffect, useState } from 'react';
import { Smartcard } from '..';

export interface UseUserSessionProps {
  smartcard?: Smartcard;
  electionDefinition?: ElectionDefinition;
  persistAuthentication: boolean; // Persist an authenticated admin session when the admin card is removed.
  bypassAuthentication?: boolean; // Always maintain an authenticated admin session for apps persisting authentication, and remove the need to authenticate admin cards for non-persisting admins.
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
export const useUserSession = ({
  smartcard,
  electionDefinition,
  persistAuthentication,
  bypassAuthentication = false,
}: UseUserSessionProps): UseUserSessionResult => {
  const [currentUserSession, setCurrentUserSession] = useState<
    Optional<UserSession>
  >();

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

        if (smartcard) {
          if (persistAuthentication && previousIsAuthenticatedAdmin) {
            return prev;
          }
          if (smartcard.data?.t) {
            if (smartcard.data.t === 'pollworker') {
              return {
                type: smartcard.data.t,
                authenticated:
                  (electionDefinition &&
                    smartcard.data.h === electionDefinition.electionHash) ??
                  false,
              };
            }
            if (smartcard.data.t === 'admin') {
              // TODO check election hash matches election definition (if there is one)
              const adminCardHasNoPin = smartcard.data.p === undefined;
              return {
                type: smartcard.data.t,
                authenticated:
                  bypassAuthentication ||
                  previousIsAuthenticatedAdmin ||
                  adminCardHasNoPin,
              };
            }
            return {
              type: smartcard.data.t,
              authenticated: true,
            };
          }
          // Invalid card type
          return {
            type: 'invalid',
            authenticated: false,
          };
        }
        if (prev && (!persistAuthentication || !previousIsAuthenticatedAdmin)) {
          // If a card is removed when there is not an authenticated session, clear the session.
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
  ]);

  const attemptToAuthenticateAdminUser = useCallback(
    (passcode: string): boolean => {
      let isAdminCard = false;
      let passcodeMatches = false;
      // The card must be an admin card to authenticate
      if (smartcard?.data?.t === 'admin') {
        isAdminCard = true;
        // There must be an expected passcode on the card to authenticate.
        if (typeof smartcard.data.p === 'string') {
          passcodeMatches = passcode === smartcard.data.p;
        }
      }
      if (isAdminCard) {
        setCurrentUserSession({
          type: 'admin',
          authenticated: passcodeMatches,
        });
      }
      return isAdminCard && passcodeMatches;
    },
    [smartcard]
  );

  const lockMachine = useCallback(() => {
    if (!bypassAuthentication) {
      setCurrentUserSession(undefined);
    }
  }, [bypassAuthentication]);

  const bootstrapAuthenticatedAdminSession = useCallback(() => {
    setCurrentUserSession({ type: 'admin', authenticated: true });
  }, []);

  return {
    currentUserSession,
    attemptToAuthenticateAdminUser,
    lockMachine,
    bootstrapAuthenticatedAdminSession,
  };
};
