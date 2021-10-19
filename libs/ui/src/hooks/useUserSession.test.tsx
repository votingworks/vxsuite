import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import {
  electionSample2Definition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {
  makeAdminCard,
  makePollWorkerCard,
  makeVoterCard,
} from '@votingworks/test-utils';
import { Optional } from '@votingworks/types';
import { Smartcard, useUserSession } from '..';

function fakeSmartcard(props: Partial<Smartcard> = {}): Smartcard {
  return {
    readLongUint8Array: jest.fn(),
    readLongString: jest.fn(),
    writeShortValue: jest.fn(),
    writeLongValue: jest.fn(),
    ...props,
  };
}

test('bypass and persist authentication flow', () => {
  const authenticatedAdmin = { type: 'admin', authenticated: true };
  // start out with smartcard as undefined, aka there is no card in the card reader.
  let smartcard: Optional<Smartcard>;
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      bypassAuthentication: true,
      persistAuthentication: true,
    })
  );
  const { currentUserSession, lockMachine } = result.current;
  expect(currentUserSession).toStrictEqual(authenticatedAdmin);
  // locking the machine doesn't do anything
  lockMachine();
  expect(currentUserSession).toStrictEqual(authenticatedAdmin);

  // update smartcard to an admin card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '000000'),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);

  // update smartcard to a pollworker card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);

  // update smartcard to a voter card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);

  // update smartcard to an invalid card, and see we still have an authenticated session
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(authenticatedAdmin);
});

test('bypass authentication flow when not persisting authentication', async () => {
  // start out with smartcard as undefined, aka there is no card in the card reader.
  let smartcard: Optional<Smartcard>;
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      bypassAuthentication: true,
      persistAuthentication: false,
    })
  );
  const { currentUserSession, lockMachine } = result.current;
  expect(currentUserSession).toStrictEqual(undefined);
  // locking the machine doesn't do anything
  lockMachine();
  expect(currentUserSession).toStrictEqual(undefined);

  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '000000'),
  });
  // update smartcard to an admin card, and see we immediately have an authenticated session
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  // update smartcard to a pollworker card, and see we now have a pollworker session
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: true,
  });

  // a pollworker card for the wrong election is not authenticated
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSample2Definition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: false,
  });

  // a voter card is authenticated
  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'voter',
    authenticated: true,
  });

  // update smartcard to an invalid card, and see we have an invalid session
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'invalid',
    authenticated: false,
  });

  // remove any card and see we have no user session
  smartcard = undefined;
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(undefined);
});

test('basic persist authentication flow works as expected', () => {
  // start out with smartcard as undefined, aka there is no card in the card reader.
  let smartcard: Optional<Smartcard>;
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      bypassAuthentication: false,
      persistAuthentication: true,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  // locking the machine doesn't do anything
  result.current.lockMachine();
  expect(result.current.currentUserSession).toStrictEqual(undefined);

  // bootstrapping an authenticated user updates the user session to an authenticated user
  act(() => result.current.bootstrapAuthenticatedAdminSession());
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  // locking the machine resets back to an undefined user session
  act(() => result.current.lockMachine());
  expect(result.current.currentUserSession).toStrictEqual(undefined);

  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '123456'),
  });
  // update smartcard to an admin card, and see we immediately an unauthenticated session
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });

  // attempting to authenticate with the wrong pin fails
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '000000'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });

  // attempting to authenticate with the correct pin succeeds
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(true);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  // removing the smartcard keeps the authenticated session in place
  smartcard = undefined;
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  // inserting other types of cards does not impact the current user session
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  smartcard = fakeSmartcard({
    data: undefined,
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  smartcard = undefined;
  rerender();

  // Locking the machine clears the current user session
  act(() => {
    result.current.lockMachine();
  });
  expect(result.current.currentUserSession).toStrictEqual(undefined);

  // When the user session is empty, inserting other cards returns those card types.
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'invalid',
    authenticated: false,
  });

  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'voter',
    authenticated: true,
  });

  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: true,
  });

  // a pollworker card for the wrong election is not authenticated
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSample2Definition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: false,
  });

  // Attempting to authenticate while we do not have an admin card fails and does not modify the user session
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: false,
  });

  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: true,
  });
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: true,
  });

  // An admin card without a pin is immediately authenticated
  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
});

test('basic flow with no persistance of authentication works as expected', async () => {
  // start out with smartcard as undefined, aka there is no card in the card reader.
  let smartcard: Optional<Smartcard>;
  const { result, rerender } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: electionSampleDefinition,
      bypassAuthentication: false,
      persistAuthentication: false,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual(undefined);
  // locking the machine doesn't do anything
  result.current.lockMachine();
  expect(result.current.currentUserSession).toStrictEqual(undefined);

  // bootstrapping an authenticated user updates the user session to an authenticated user
  act(() => result.current.bootstrapAuthenticatedAdminSession());
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  // locking the machine resets back to an undefined user session
  act(() => result.current.lockMachine());
  expect(result.current.currentUserSession).toStrictEqual(undefined);

  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash, '123456'),
  });
  // update smartcard to an admin card, and see we immediately an unauthenticated session
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });

  // attempting to authenticate with the wrong pin fails
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '000000'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });

  // attempting to authenticate with the correct pin succeeds
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(true);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });

  // removing the smartcard clears the session
  smartcard = undefined;
  rerender();
  expect(result.current.currentUserSession).toStrictEqual(undefined);

  // Inserting other cards returns those card types.
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'invalid',
    authenticated: false,
  });

  smartcard = fakeSmartcard({
    data: makeVoterCard(electionSampleDefinition.election),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'voter',
    authenticated: true,
  });

  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: true,
  });

  // a pollworker card for the wrong election is not authenticated
  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSample2Definition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: false,
  });

  // Attempting to authenticate while we do not have an admin card fails and does not modify the user session
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: false,
  });

  smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: true,
  });
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: true,
  });

  smartcard = undefined;
  rerender();
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual(undefined);

  // Inserting other cards returns those card types.
  smartcard = fakeSmartcard({
    data: undefined,
  });
  rerender();
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'invalid',
    authenticated: false,
  });

  // An admin card without a pin is immediately authenticated
  smartcard = fakeSmartcard({
    data: makeAdminCard(electionSampleDefinition.electionHash),
  });
  rerender();
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: true,
  });
  // Attempting to authenticate an admin card without a pin fails
  act(() => {
    const attemptResult = result.current.attemptToAuthenticateAdminUser(
      '123456'
    );
    expect(attemptResult).toBe(false);
  });
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'admin',
    authenticated: false,
  });
});

test('if not provided, default to NOT bypassing authentication', () => {
  const { result } = renderHook(() =>
    useUserSession({
      smartcard: undefined,
      electionDefinition: electionSampleDefinition,
      persistAuthentication: true,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual(undefined);
});

test('when there is no election definition, pollworker is never authenticated', () => {
  const smartcard = fakeSmartcard({
    data: makePollWorkerCard(electionSampleDefinition.electionHash),
  });
  const { result } = renderHook(() =>
    useUserSession({
      smartcard,
      electionDefinition: undefined,
      persistAuthentication: false,
    })
  );
  expect(result.current.currentUserSession).toStrictEqual({
    type: 'pollworker',
    authenticated: false,
  });
});
