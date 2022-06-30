import { act, renderHook } from '@testing-library/react-hooks';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
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
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(undefined, undefined, 'error');
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
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

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'unknown',
      expect.objectContaining({ disposition: 'failure', reason: 'card_error' })
    );
  });

  it('when an admin card is inserted, checks the passcode', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
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
      wrongPasscodeEnteredAt: undefined,
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
      wrongPasscodeEnteredAt: expect.any(Date),
    });

    // Check an incorrect passcode again (to make sure we log multiple failed attempts)
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode('111111');
    });
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'checking_passcode',
      user,
      wrongPasscodeEnteredAt: expect.any(Date),
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

    expect(logger.log).toHaveBeenCalledTimes(5);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.AuthPasscodeEntry,
      'admin',
      expect.objectContaining({ disposition: 'failure' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthPasscodeEntry,
      'admin',
      expect.objectContaining({ disposition: 'failure' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.AuthPasscodeEntry,
      'admin',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.AuthLogin,
      'admin',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
      LogEventId.AuthLogout,
      'admin',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  it('when checking passcode, locks machine if card is removed', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeAdminCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
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

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthPasscodeEntry,
      'admin',
      expect.objectContaining({
        disposition: 'failure',
        message: 'User canceled passcode entry.',
      })
    );
  });

  it('when a superadmin card is dipped, logs in', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const user = fakeSuperadminUser();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
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

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.AuthLogin,
      'superadmin',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthLogout,
      'superadmin',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  it('can bootstrap an admin session', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
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

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'admin',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  it('returns logged_out auth when the card is not programmed correctly', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });

    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);

    cardApi.insertCard('invalid card data');
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'unknown',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'invalid_user_on_card',
      })
    );
  });

  it('returns logged_out auth when the card user role is not allowed', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'user_role_not_allowed',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'pollworker',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'user_role_not_allowed',
      })
    );
  });
});
