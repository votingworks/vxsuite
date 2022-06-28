import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import {
  electionSample2Definition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import {
  makeAdminCard,
  makePollWorkerCard,
  makeVoterCard,
} from '@votingworks/test-utils';
import { UserRole, UserSession } from '@votingworks/types';
import { Smartcard, useUserSession } from '..';

function fakeSmartcard(props: Partial<Smartcard> = {}): Smartcard {
  return {
    status: 'ready',
    readLongUint8Array: jest.fn(),
    readLongString: jest.fn(),
    writeShortValue: jest.fn(),
    writeLongValue: jest.fn(),
    ...props,
  };
}

test('bypass and persist authentication flow', () => {
  const authenticatedAdmin: UserSession = {
    type: 'admin',
    authenticated: true,
  };
  let smartcard: Smartcard = { status: 'no_card' };
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      logger: fakeLogger,
      bypassAuthentication: true,
      persistAuthentication: true,
      validUserTypes: ['admin'],
    })
  );
  const { currentUserSession, lockMachine } = result.current;
  expect(currentUserSession).toStrictEqual(authenticatedAdmin);
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  // locking the machine doesn't do anything
  lockMachine();
  expect(currentUserSession).toStrictEqual(authenticatedAdmin);
  expect(logSpy).toHaveBeenCalledTimes(1);

  // update smartcard to an admin card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '000000'),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);
  expect(logSpy).toHaveBeenCalledTimes(1);

  // update smartcard to a pollworker card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);
  expect(logSpy).toHaveBeenCalledTimes(1);

  // update smartcard to a voter card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);
  expect(logSpy).toHaveBeenCalledTimes(1);

  // update smartcard to an invalid card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);
  expect(logSpy).toHaveBeenCalledTimes(1);
});

test('bypass authentication flow when not persisting authentication', () => {
  let smartcard: Smartcard = { status: 'no_card' };
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const validUserTypes: UserRole[] = [
    'admin',
    'pollworker',
    'voter',
    'superadmin',
  ];
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      logger: fakeLogger,
      bypassAuthentication: true,
      persistAuthentication: false,
      validUserTypes,
    })
  );
  const { currentUserSession, lockMachine } = result.current;
  expect(currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(0);
  // locking the machine doesn't do anything
  lockMachine();
  expect(currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(0);

  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '000000'),
  });
  // update smartcard to an admin card, and see we immediately have an authenticated session

  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  // There should be a corresponding log for the new admin session.
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // update smartcard to a superadmin card, and see we now have a superadmin session
  smartcard = fakeSmartcard({
    data: { t: 'superadmin' },
  });
  // update smartcard to an admin card, and see we immediately have an authenticated session

  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'superadmin',
    authenticated: true,
  });
  // There should be a corresponding log for the new admin session.
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'superadmin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // update smartcard to a pollworker card, and see we now have a pollworker session
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: true,
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(3);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'pollworker',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // a pollworker card for the wrong election is not authenticated
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSample2Definition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: false,
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(4);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'pollworker',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // a voter card is authenticated
  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'voter',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(5);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'voter',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // update smartcard to an invalid card, and see we have an invalid session
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(6);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // remove any card and see we have no user session
  smartcard = { status: 'no_card' };
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(7);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserLoggedOut,
    'unknown',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // update smartcard to a connection error, and see we have no user session
  smartcard = { status: 'error' };
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(7);
});

test('basic persist authentication flow works as expected', () => {
  let smartcard: Smartcard = { status: 'no_card' };
  const validUserTypes: UserRole[] = ['admin'];
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      logger: fakeLogger,
      bypassAuthentication: false,
      persistAuthentication: true,
      validUserTypes,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(0);
  // locking the machine doesn't do anything
  result.current.lockMachine();
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(0);

  // bootstrapping an authenticated user updates the user session to an authenticated user
  act(() => result.current.bootstrapAuthenticatedAdminSession());
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // locking the machine resets back to an undefined user session
  act(() => result.current.lockMachine());
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(3);
  expect(logSpy).toHaveBeenNthCalledWith(
    2,
    LogEventId.MachineLocked,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserLoggedOut,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '123456'),
  });
  // update smartcard to an admin card, and see we immediately an unauthenticated session
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(4);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminCardInserted,
    'unknown',
    expect.objectContaining({
      disposition: 'na',
    })
  );

  // attempting to authenticate with the wrong pin fails
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('000000');
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(5);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // attempting to authenticate with the correct pin succeeds
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(true);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(7);
  expect(logSpy).toHaveBeenNthCalledWith(
    6,
    LogEventId.AdminAuthenticationTwoFactor,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // removing the smartcard keeps the authenticated session in place
  smartcard = { status: 'no_card' };
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(7);

  // inserting other types of cards does not impact the current user session
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(7);

  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(7);

  smartcard = fakeSmartcard({
    data: undefined,
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(7);

  smartcard = { status: 'error' };
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(7);

  smartcard = { status: 'no_card' };
  rerender();
  expect(logSpy).toHaveBeenCalledTimes(7);

  // Locking the machine clears the current user session
  act(() => {
    result.current.lockMachine();
  });
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(9);
  expect(logSpy).toHaveBeenNthCalledWith(
    8,
    LogEventId.MachineLocked,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserLoggedOut,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // When the user session is empty, inserting other cards returns unknown sessions.
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(10);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    attemptedUserType: 'voter',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(11);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    attemptedUserType: 'pollworker',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(12);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // Attempting to authenticate while we do not have an admin card fails and does not modify the user session
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    attemptedUserType: 'pollworker',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(13);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});

test('basic flow with no persistance of authentication works as expected', () => {
  let smartcard: Smartcard = { status: 'no_card' };
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const validUserTypes: UserRole[] = ['admin', 'pollworker'];
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      logger: fakeLogger,
      bypassAuthentication: false,
      persistAuthentication: false,
      validUserTypes,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  // locking the machine doesn't do anything
  result.current.lockMachine();
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(0);

  // bootstrapping an authenticated user updates the user session to an authenticated user
  act(() => result.current.bootstrapAuthenticatedAdminSession());
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // locking the machine resets back to an undefined user session
  act(() => result.current.lockMachine());
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(3);
  expect(logSpy).toHaveBeenNthCalledWith(
    2,
    LogEventId.MachineLocked,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserLoggedOut,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '123456'),
  });
  // update smartcard to an admin card, and see we immediately an unauthenticated session
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(4);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminCardInserted,
    'unknown',
    expect.objectContaining({
      disposition: 'na',
    })
  );

  // attempting to authenticate with the wrong pin fails
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('000000');
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(5);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // attempting to authenticate with the correct pin succeeds
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(true);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(7);
  expect(logSpy).toHaveBeenNthCalledWith(
    6,
    LogEventId.AdminAuthenticationTwoFactor,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // removing the smartcard clears the session
  smartcard = { status: 'no_card' };
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(8);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserLoggedOut,
    'admin',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // Inserting other cards returns those card types.
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(9);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // This app is not configured to accept voters.
  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    attemptedUserType: 'voter',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(10);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: true,
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(11);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'pollworker',
    expect.objectContaining({
      disposition: 'success',
    })
  );

  // a pollworker card for the wrong election is not authenticated
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSample2Definition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: false,
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(12);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'pollworker',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // Attempting to authenticate while we do not have an admin card fails and does not modify the user session
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: false,
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(13);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'pollworker',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: true,
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(14);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'pollworker',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: true,
    authenticated: true,
  });
  expect(logSpy).toHaveBeenCalledTimes(15);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'pollworker',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  smartcard = { status: 'no_card' };
  rerender();
  expect(logSpy).toHaveBeenCalledTimes(16);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserLoggedOut,
    'pollworker',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  expect(logSpy).toHaveBeenCalledTimes(17);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  // Inserting other cards returns those card types.
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(logSpy).toHaveBeenCalledTimes(18);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );
  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'unknown',
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(19);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );

  act(() => {
    const attemptResult =
      result.current.attemptToAuthenticateAdminUser('123456');
    expect(attemptResult).toBe(false);
  });
  expect(logSpy).toHaveBeenCalledTimes(20);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.AdminAuthenticationTwoFactor,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});

test('if not provided, default to NOT bypassing authentication', () => {
  const validUserTypes: UserRole[] = ['admin'];
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const { result } = renderHook(() =>
    useUserSession({
      smartcard: { status: 'no_card' },
      logger: fakeLogger,
      electionDefinition: electionSampleDefinition,
      persistAuthentication: true,
      validUserTypes,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual(undefined);
});

test('when there is no election definition, pollworker is never authenticated', () => {
  const smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  const validUserTypes: UserRole[] = ['admin', 'pollworker'];
  const fakeLogger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(fakeLogger, 'log').mockResolvedValue();
  const { result } = renderHook(() =>
    useUserSession({
      smartcard,
      logger: fakeLogger,
      electionDefinition: undefined,
      persistAuthentication: false,
      validUserTypes,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    isElectionHashValid: false,
    authenticated: false,
  });
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenLastCalledWith(
    LogEventId.UserSessionActivationAttempt,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});
