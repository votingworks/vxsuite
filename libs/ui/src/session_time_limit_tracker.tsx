/* istanbul ignore file */
import { DateTime } from 'luxon';
import pluralize from 'pluralize';
import React, { useState } from 'react';
import { useIdleTimer } from 'react-idle-timer';
import {
  DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES,
  DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  DippedSmartCardAuth,
  InsertedSmartCardAuth,
  SystemSettings,
} from '@votingworks/types';

import { Button } from './button';
import { useNow } from './hooks/use_now';
import { Modal } from './modal';
import { Prose } from './prose';
import { Timer } from './timer';
import { Caption, H1, P } from './typography';

const SECONDS_TO_WRAP_UP_AFTER_INACTIVE_SESSION_TIME_LIMIT = 60;
const SECONDS_AHEAD_OF_OVERALL_SESSION_TIME_LIMIT_TO_WARN = 15 * 60;

type AuthStatusWithSessionExpiry =
  | DippedSmartCardAuth.RemoveCard
  | DippedSmartCardAuth.LoggedIn
  | InsertedSmartCardAuth.LoggedIn;

function computeSecondsToSessionExpiry(
  authStatus: AuthStatusWithSessionExpiry,
  now: Date
): number {
  return Math.max(
    (new Date(authStatus.sessionExpiresAt).getTime() - now.getTime()) / 1000,
    0
  );
}

function shouldDisplayTimeLimitPrompt(
  authStatus: AuthStatusWithSessionExpiry,
  now: Date
): boolean {
  const secondsToSessionExpiry = computeSecondsToSessionExpiry(authStatus, now);
  return (
    // Despite looking like a condition for only the overall session time limit, this condition
    // also covers the inactive session time limit, since we trigger the logout for that limit by
    // bringing the session expiry up, even closer than
    // SECONDS_AHEAD_OF_OVERALL_SESSION_TIME_LIMIT_TO_WARN
    secondsToSessionExpiry <=
    SECONDS_AHEAD_OF_OVERALL_SESSION_TIME_LIMIT_TO_WARN
  );
}

interface SessionTimeLimitTrackerHelperProps {
  authStatus: AuthStatusWithSessionExpiry;
  logOut: () => void;
  systemSettings: SystemSettings;
  updateSessionExpiry: (sessionExpiresAt: Date) => void;
}

/**
 * A helper for SessionTimeLimitTracker
 */
function SessionTimeLimitTrackerHelper({
  authStatus,
  logOut,
  systemSettings,
  updateSessionExpiry,
}: SessionTimeLimitTrackerHelperProps): JSX.Element | null {
  const inactiveSessionTimeLimitMinutes =
    systemSettings?.inactiveSessionTimeLimitMinutes ??
    DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES;
  const overallSessionTimeLimitHours =
    systemSettings?.overallSessionTimeLimitHours ??
    DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS;

  const now = useNow().toJSDate();
  const [
    hasInactiveSessionTimeLimitBeenHit,
    setHasInactiveSessionTimeLimitBeenHit,
  ] = useState(false);
  const [isModalDismissed, setIsModalDismissed] = useState(false);

  function dismissModal() {
    setIsModalDismissed(true);
  }

  useIdleTimer({
    onIdle: () => {
      setHasInactiveSessionTimeLimitBeenHit(true);
      // Have the backend log out in SECONDS_TO_WRAP_UP_AFTER_INACTIVE_SESSION_TIME_LIMIT
      updateSessionExpiry(
        DateTime.now()
          .plus({
            seconds: SECONDS_TO_WRAP_UP_AFTER_INACTIVE_SESSION_TIME_LIMIT,
          })
          .toJSDate()
      );
    },
    stopOnIdle: true,
    timeout: inactiveSessionTimeLimitMinutes * 60 * 1000,
  });

  if (shouldDisplayTimeLimitPrompt(authStatus, now) && !isModalDismissed) {
    return (
      <Modal
        actions={
          <React.Fragment>
            <Button variant="primary" onPress={logOut}>
              Lock Machine Now
            </Button>
            <Button onPress={dismissModal}>Dismiss</Button>
          </React.Fragment>
        }
        content={
          <Prose textCenter>
            <H1>Session Time Limit</H1>
            {hasInactiveSessionTimeLimitBeenHit ? (
              // Inactive session time limit
              <P>
                Your session has been inactive for{' '}
                {pluralize('minutes', inactiveSessionTimeLimitMinutes, true)}.
                <br />
                The machine will automatically lock in{' '}
                <Timer countDownTo={new Date(authStatus.sessionExpiresAt)} />.
              </P>
            ) : (
              // Overall session time limit
              <P>
                You are approaching the session time limit of{' '}
                {pluralize('hours', overallSessionTimeLimitHours, true)}.
                <br />
                The machine will automatically lock in{' '}
                <Timer countDownTo={new Date(authStatus.sessionExpiresAt)} />.
              </P>
            )}
            <P>
              Lock the machine now and reauthenticate
              <br />
              with your smart card to continue working.
            </P>
          </Prose>
        }
      />
    );
  }

  return null;
}

interface SessionTimeLimitTrackerProps {
  authStatus?:
    | DippedSmartCardAuth.AuthStatus
    | InsertedSmartCardAuth.AuthStatus;
  logOut: () => void;
  systemSettings?: SystemSettings;
  updateSessionExpiry: (sessionExpiresAt: Date) => void;
}

/**
 * Tracks inactive and overall session time, surfacing the relevant prompts as limits are
 * approached/hit
 */
export function SessionTimeLimitTracker({
  authStatus,
  logOut,
  systemSettings,
  updateSessionExpiry,
}: SessionTimeLimitTrackerProps): JSX.Element | null {
  // Data is still being loaded
  if (authStatus === undefined || systemSettings === undefined) {
    return null;
  }

  if (
    authStatus.status !== 'remove_card' &&
    authStatus.status !== 'logged_in'
  ) {
    return null;
  }

  return (
    <SessionTimeLimitTrackerHelper
      authStatus={authStatus}
      logOut={logOut}
      systemSettings={systemSettings}
      updateSessionExpiry={updateSessionExpiry}
    />
  );
}

interface SessionTimeLimitTimerProps {
  authStatus?:
    | DippedSmartCardAuth.AuthStatus
    | InsertedSmartCardAuth.AuthStatus;
}

/**
 * Displays a count down timer to session expiry. Appears at the same time as the prompts surfaced
 * by SessionTimeLimitTracker.
 */
export function SessionTimeLimitTimer({
  authStatus,
}: SessionTimeLimitTimerProps): JSX.Element | null {
  const now = useNow().toJSDate();

  if (authStatus?.status !== 'logged_in') {
    return null;
  }
  if (shouldDisplayTimeLimitPrompt(authStatus, now)) {
    return (
      <span>
        <Caption>Machine will automatically lock in</Caption>{' '}
        <Timer countDownTo={new Date(authStatus.sessionExpiresAt)} />
      </span>
    );
  }
  return null;
}
