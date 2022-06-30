import { act, renderHook } from '@testing-library/react-hooks';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  fakeAdminUser,
  fakeSuperadminUser,
  makeAdminCard,
  makePollWorkerCard,
  makeSuperadminCard,
} from '@votingworks/test-utils';
import { assert, MemoryCard } from '@votingworks/utils';
import { CARD_POLLING_INTERVAL } from './auth_helpers';
import { useDippedSmartcardAuth } from './use_dipped_smartcard_auth';

const electionDefinition = electionSampleDefinition;
const { electionHash } = electionDefinition;

describe('useDippedSmartcardAuth', () => {
  beforeEach(() => jest.useFakeTimers());

  it("when machine is locked, returns logged_out auth when there's no card or a card error", async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(undefined, undefined, 'error');
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi })
    );
    // Default before reading card is logged_out
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });

    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'card_error',
    });

    // Now remove the card and check again
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });
  });

  it('when an admin card is inserted, checks the passcode', async () => {
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi })
    );
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });

    // Insert an admin card
    const passcode = '123456';
    const user = fakeAdminUser({ electionHash, passcode });
    cardApi.insertCard(makeAdminCard(electionHash, passcode));
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'checking_passcode',
      user,
      wrongPasscodeEntered: undefined,
      checkPasscode: expect.any(Function),
    });

    // Check an incorrect passcode
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode('000000');
    });
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'checking_passcode',
      user,
      wrongPasscodeEntered: true,
    });

    // Check the correct passcode
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode(passcode);
    });
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'remove_card',
      user,
    });

    // Remove the card to log in
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_in',
      card: undefined,
      user,
      logOut: expect.any(Function),
    });

    // Inserting a different card doesn't log out (so card can be programmed)
    cardApi.insertCard(makeSuperadminCard());
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      card: expect.any(Object),
      user,
    });
    cardApi.removeCard();

    // Admin can log out
    act(() => {
      assert(result.current.status === 'logged_in');
      result.current.logOut();
    });
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });
  });

  it('when checking passcode, locks machine if card is removed', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeAdminCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({ status: 'checking_passcode' });

    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });
  });

  it('when a superadmin card is dipped, logs in', async () => {
    const cardApi = new MemoryCard();
    const user = fakeSuperadminUser();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'remove_card',
      user,
    });

    // Remove card to log in
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_in',
      user,
      card: undefined,
      logOut: expect.any(Function),
    });

    // Inserting a different card doesn't log out (so card can be programmed)
    cardApi.insertCard(makeAdminCard(electionHash));
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      card: expect.any(Object),
      user,
    });
    cardApi.removeCard();

    // Superadmin can log out
    act(() => {
      assert(result.current.status === 'logged_in');
      result.current.logOut();
    });
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });
  });

  it('can bootstrap an admin session', async () => {
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi })
    );
    act(() => {
      assert(result.current.status === 'logged_out');
      result.current.bootstrapAuthenticatedAdminSession(electionHash);
    });
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakeAdminUser({ electionHash, passcode: '000000' }),
    });
  });

  it('returns logged_out auth when the card is not programmed correctly', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });

    cardApi.insertCard('invalid card data');
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });
  });

  it('returns logged_out auth when the card user role is not allowed', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'user_role_not_allowed',
    });
  });
});
