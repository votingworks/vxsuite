import { act, renderHook } from '@testing-library/react-hooks';
import {
  electionSampleDefinition,
  electionSample2Definition,
} from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import {
  fakeElectionManagerUser,
  fakeSystemAdministratorUser,
  makeElectionManagerCard,
  makePollWorkerCard,
  makeSystemAdministratorCard,
  mockOf,
} from '@votingworks/test-utils';
import { assert, MemoryCard } from '@votingworks/utils';

import { areVvsg2AuthFlowsEnabled } from '../../config/features';
import { useDippedSmartcardAuth } from './use_dipped_smartcard_auth';

const electionDefinition = electionSampleDefinition;
const { electionHash } = electionDefinition;
const otherElectionHash = electionSample2Definition.electionHash;

jest.mock(
  '../../config/features',
  (): typeof import('../../config/features') => {
    return {
      ...jest.requireActual('../../config/features'),
      areVvsg2AuthFlowsEnabled: jest.fn(),
    };
  }
);

describe('useDippedSmartcardAuth', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => false);
  });

  it("when machine is locked, returns logged_out auth when there's no card or a card error", async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(undefined, undefined, 'error');
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    // Default before reading card is logged_out
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });

    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'card_error',
    });

    // Now remove the card and check again
    cardApi.removeCard();
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

  it('when a system administrator card is inserted, checks the passcode', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });

    // Insert a system administrator card
    const passcode = '123456';
    const user = fakeSystemAdministratorUser({ passcode });
    cardApi.insertCard(makeSystemAdministratorCard(passcode));
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
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_in',
      card: undefined,
      user,
      logOut: expect.any(Function),
    });

    // Inserting a different card doesn't log out (so card can be programmed)
    cardApi.insertCard(makeElectionManagerCard(electionHash));
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      card: expect.any(Object),
      user,
    });
    cardApi.removeCard();

    // System administrator can log out
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
      'system_administrator',
      expect.objectContaining({ disposition: 'failure' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthPasscodeEntry,
      'system_administrator',
      expect.objectContaining({ disposition: 'failure' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.AuthPasscodeEntry,
      'system_administrator',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.AuthLogin,
      'system_administrator',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
      LogEventId.AuthLogout,
      'system_administrator',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  it('when an election manager card is inserted, checks the passcode', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });

    // Insert an election manager card
    const passcode = '123456';
    const user = fakeElectionManagerUser({ electionHash, passcode });
    cardApi.insertCard(makeElectionManagerCard(electionHash, passcode));
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
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_in',
      card: undefined,
      user,
      logOut: expect.any(Function),
    });

    // Inserting a different card doesn't log out
    cardApi.insertCard(makeSystemAdministratorCard());
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
      'election_manager',
      expect.objectContaining({ disposition: 'failure' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthPasscodeEntry,
      'election_manager',
      expect.objectContaining({ disposition: 'failure' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.AuthPasscodeEntry,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.AuthLogin,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
      LogEventId.AuthLogout,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  it('when checking passcode, locks machine if card is removed', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeElectionManagerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    await waitForNextUpdate();
    expect(result.current).toMatchObject({ status: 'checking_passcode' });

    cardApi.removeCard();
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_locked',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthPasscodeEntry,
      'election_manager',
      expect.objectContaining({
        disposition: 'failure',
        message: 'User canceled passcode entry.',
      })
    );
  });

  it('can bootstrap an election manager session', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    act(() => {
      assert(result.current.status === 'logged_out');
      result.current.bootstrapAuthenticatedElectionManagerSession(electionHash);
    });
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakeElectionManagerUser({ electionHash, passcode: '000000' }),
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  it('returns logged_out auth when the card is not programmed correctly', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });

    cardApi.removeCard();
    await waitForNextUpdate();

    cardApi.insertCard('invalid card data');
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
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'user_role_not_allowed',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'poll_worker',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'user_role_not_allowed',
      })
    );
  });

  it('returns logged_out auth when machine is not configured and election manager is not allowed to access unconfigured machines', async () => {
    mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => true);
    const cardApi = new MemoryCard();
    const logger = fakeLogger();

    cardApi.insertCard(makeElectionManagerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition: undefined },
      })
    );
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'machine_not_configured',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'election_manager',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'machine_not_configured',
      })
    );
  });

  it('allows election managers to access unconfigured machines when setting is enabled', async () => {
    mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => true);
    const cardApi = new MemoryCard();
    const logger = fakeLogger();

    cardApi.insertCard(makeElectionManagerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: {
          allowElectionManagersToAccessUnconfiguredMachines: true,
          electionDefinition: undefined,
        },
      })
    );
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'checking_passcode',
    });

    expect(logger.log).toHaveBeenCalledTimes(0);
  });

  it('returns logged_out auth when election manager card election hash does not match machine election hash', async () => {
    mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => true);
    const cardApi = new MemoryCard();
    const logger = fakeLogger();

    cardApi.insertCard(makeElectionManagerCard(otherElectionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'election_manager_wrong_election',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'election_manager',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'election_manager_wrong_election',
      })
    );
  });
});
