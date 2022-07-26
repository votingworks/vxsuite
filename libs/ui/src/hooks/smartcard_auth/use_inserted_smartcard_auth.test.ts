import { act, renderHook } from '@testing-library/react-hooks';
import {
  electionSample2Definition,
  electionSampleDefinition,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import {
  makePollWorkerCard,
  makeSuperadminCard,
  fakeSuperadminUser,
  makeAdminCard,
  fakeAdminUser,
  fakePollworkerUser,
  makeVoterCard,
  fakeVoterUser,
  fakeCardlessVoterUser,
} from '@votingworks/test-utils';
import {
  PrecinctSelection,
  PrecinctSelectionKind,
  UserRole,
} from '@votingworks/types';
import { assert, MemoryCard, utcTimestamp } from '@votingworks/utils';
import {
  CARD_POLLING_INTERVAL,
  isVoterAuth,
  isPollworkerAuth,
  isCardlessVoterAuth,
} from './auth_helpers';
import {
  useInsertedSmartcardAuth,
  VOTER_CARD_EXPIRATION_SECONDS,
} from './use_inserted_smartcard_auth';

const allowedUserRoles: UserRole[] = [
  'superadmin',
  'admin',
  'pollworker',
  'voter',
  'cardless_voter',
];

const electionDefinition = electionSampleDefinition;
const { electionHash, election } = electionDefinition;
const precinct: PrecinctSelection = {
  kind: PrecinctSelectionKind.SinglePrecinct,
  precinctId: election.precincts[0].id,
};
const ballotStyle = election.ballotStyles[0];

describe('useInsertedSmartcardAuth', () => {
  beforeEach(() => jest.useFakeTimers());

  it("returns logged_out auth when there's no card or a card error", async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(undefined, undefined, 'error');
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
        logger,
      })
    );
    // Default before reading card is logged_out
    expect(result.current).toEqual({ status: 'logged_out', reason: 'no_card' });

    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'card_error',
    });

    // Now remove the card and check again
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({ status: 'logged_out', reason: 'no_card' });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'unknown',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'card_error',
      })
    );
  });

  it('returns logged_out auth when the card is not programmed correctly', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });

    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);

    cardApi.insertCard('invalid card data');
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
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
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles: ['superadmin', 'admin'],
        scope: { electionDefinition },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'user_role_not_allowed',
      cardUserRole: 'pollworker',
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

  it('returns logged_out auth when using a pollworker card if the machine is not configured', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'machine_not_configured',
      cardUserRole: 'pollworker',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'pollworker',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'machine_not_configured',
      })
    );
  });

  it('returns logged_out auth when using a pollworker card that doesnt match the configured election', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition: electionSample2Definition },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'pollworker_wrong_election',
      cardUserRole: 'pollworker',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'pollworker',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'pollworker_wrong_election',
      })
    );
  });

  it('returns logged_out auth when using a voter card that has expired', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(
      makeVoterCard(election, {
        c: utcTimestamp() - VOTER_CARD_EXPIRATION_SECONDS,
      })
    );
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_expired',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'voter_card_expired',
      })
    );
  });

  it('returns logged_out auth when using a voter card if the machine is not configured', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'machine_not_configured',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'machine_not_configured',
      })
    );
  });

  it('returns logged_out auth when using a voter card with a ballot style that doesnt match the configured election', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {
          electionDefinition: electionMinimalExhaustiveSampleDefinition,
          precinct,
        },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_wrong_election',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'voter_wrong_election',
      })
    );
  });

  it('returns logged_out auth when using a voter card with a precinct that doesnt match the configured election', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {
          electionDefinition: electionMinimalExhaustiveSampleDefinition,
          precinct,
        },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_wrong_election',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'voter_wrong_election',
      })
    );
  });

  it('returns logged_out auth when using a voter card with a precinct that doesnt match the configured precinct', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(
      makeVoterCard(election, { pr: election.precincts[1].id })
    );
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_wrong_precinct',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'voter_wrong_precinct',
      })
    );
  });

  it('returns logged_in auth when using a voter card and all precincts are configured', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {
          electionDefinition,
          precinct: { kind: PrecinctSelectionKind.AllPrecincts },
        },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({ status: 'logged_in' });
  });

  it('returns logged_out auth for a voided voter card', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election, { uz: 1 }));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_voided',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'voter_card_voided',
      })
    );
  });

  it('returns logged_out auth for a printed voter card', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election, { bp: 1 }));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_printed',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'failure',
        reason: 'voter_card_printed',
      })
    );
  });

  it('when a super admin card is inserted, checks the passcode', async () => {
    const cardApi = new MemoryCard();
    const logger = fakeLogger();
    const passcode = '123456';
    const user = fakeSuperadminUser({ passcode });

    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
        logger,
      })
    );
    expect(result.current.status).toEqual('logged_out');

    // Insert a super admin card
    cardApi.insertCard(makeSuperadminCard(passcode));
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
      status: 'logged_in',
      user,
      card: expect.any(Object),
    });

    expect(logger.log).toHaveBeenCalledTimes(4);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.AuthPasscodeEntry,
      'superadmin',
      expect.objectContaining({
        disposition: 'failure',
      })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthPasscodeEntry,
      'superadmin',
      expect.objectContaining({
        disposition: 'failure',
      })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.AuthPasscodeEntry,
      'superadmin',
      expect.objectContaining({
        disposition: 'success',
      })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.AuthLogin,
      'superadmin',
      expect.objectContaining({
        disposition: 'success',
      })
    );
  });

  it('when an admin card is inserted, checks the passcode', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const passcode = '123456';
    const user = fakeAdminUser({ electionHash, passcode });
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
        logger,
      })
    );
    expect(result.current.status).toEqual('logged_out');

    // Insert an admin card
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
      status: 'logged_in',
      user,
      card: expect.any(Object),
    });

    expect(logger.log).toHaveBeenCalledTimes(4);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.AuthPasscodeEntry,
      'admin',
      expect.objectContaining({
        disposition: 'failure',
      })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthPasscodeEntry,
      'admin',
      expect.objectContaining({
        disposition: 'failure',
      })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.AuthPasscodeEntry,
      'admin',
      expect.objectContaining({
        disposition: 'success',
      })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.AuthLogin,
      'admin',
      expect.objectContaining({
        disposition: 'success',
      })
    );
  });

  it('when checking passcode, logs out if card is removed', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeAdminCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({ cardApi, allowedUserRoles, scope: {}, logger })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({ status: 'checking_passcode' });

    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_out',
      reason: 'no_card',
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

  it('returns logged_in auth for a pollworker card', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakePollworkerUser({ electionHash }),
      card: expect.any(Object),
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'pollworker',
      expect.objectContaining({
        disposition: 'success',
      })
    );
  });

  it('returns logged_in auth for a voter card', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const voterCard = makeVoterCard(election);
    cardApi.insertCard(voterCard);
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakeVoterUser({
        ballotStyleId: voterCard.bs,
        precinctId: voterCard.pr,
        createdAt: voterCard.c,
      }),
      card: expect.any(Object),
      markCardVoided: expect.any(Function),
      markCardPrinted: expect.any(Function),
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogin,
      'voter',
      expect.objectContaining({
        disposition: 'success',
      })
    );
  });

  it('for a logged in voter, marks the voter card voided', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const voterCard = makeVoterCard(election);
    cardApi.insertCard(voterCard);
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isVoterAuth(result.current));
    await result.current.markCardVoided();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_voided',
      cardUserRole: 'voter',
    });

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogout,
      'voter',
      expect.objectContaining({
        disposition: 'success',
        reason: 'voter_card_voided',
      })
    );
  });

  it('for a logged in voter, handles an error marking the voter card voided', async () => {
    const cardApi = new MemoryCard();
    const voterCard = makeVoterCard(election);
    cardApi.insertCard(voterCard);
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isVoterAuth(result.current));
    const error = new Error('test error');
    jest.spyOn(cardApi, 'writeShortValue').mockRejectedValue(error);
    expect((await result.current.markCardVoided()).err()).toEqual(error);
  });

  it('for a logged in voter, marks the voter card printed', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    const voterCard = makeVoterCard(election);
    cardApi.insertCard(voterCard);
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isVoterAuth(result.current));
    await result.current.markCardPrinted();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    // Shouldn't log out until card removed
    expect(result.current.status).toEqual('logged_in');
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.status).toEqual('logged_out');

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogout,
      'voter',
      expect.objectContaining({ disposition: 'success', reason: 'no_card' })
    );
  });

  it('for a logged in voter, handles an error marking the voter card printed', async () => {
    const cardApi = new MemoryCard();
    const voterCard = makeVoterCard(election);
    cardApi.insertCard(voterCard);
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isVoterAuth(result.current));
    const error = new Error('test error');
    jest.spyOn(cardApi, 'writeShortValue').mockRejectedValue(error);
    expect((await result.current.markCardPrinted()).err()).toEqual(error);
  });

  // There's one lock applied to voiding, printing, and all long value writes,
  // but here we just test voiding/printing and cover long value writes below.
  it('raises an error on concurrent voiding/printing', async () => {
    const cardApi = new MemoryCard();
    const voterCard = makeVoterCard(election);
    cardApi.insertCard(voterCard);
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isVoterAuth(result.current));

    const [voidResult, printResult] = await Promise.all([
      result.current.markCardVoided(),
      result.current.markCardPrinted(),
    ]);

    expect(voidResult.isErr()).toBe(false);
    expect(printResult.isErr()).toBe(true);
    expect(printResult.err()?.message).toEqual('Card write in progress');
  });

  it('logs out user when card is removed', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakePollworkerUser({ electionHash }),
      card: expect.any(Object),
    });

    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({ status: 'logged_out', reason: 'no_card' });

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenLastCalledWith(
      LogEventId.AuthLogout,
      'pollworker',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  it('for a logged in pollworker, activates and deactivates a cardless voter session', async () => {
    const logger = fakeLogger();
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition },
        logger,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isPollworkerAuth(result.current));
    expect(result.current.activatedCardlessVoter).toBeUndefined();

    // Activate cardless voter
    const cardlessVoter = fakeCardlessVoterUser({
      precinctId: precinct.precinctId,
      ballotStyleId: ballotStyle.id,
    });
    act(() => {
      assert(isPollworkerAuth(result.current));
      result.current.activateCardlessVoter(
        cardlessVoter.precinctId,
        cardlessVoter.ballotStyleId
      );
    });
    await waitForNextUpdate();
    expect(result.current.activatedCardlessVoter).toMatchObject(cardlessVoter);

    // Remove pollworker card to log in cardless voter
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: cardlessVoter,
      logOut: expect.any(Function),
    });

    // Pollworker can deactivate cardless voter, logging them out
    cardApi.insertCard(makePollWorkerCard(electionHash));
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    act(() => {
      assert(isPollworkerAuth(result.current));
      result.current.deactivateCardlessVoter();
    });
    await waitForNextUpdate();
    expect(result.current.activatedCardlessVoter).toBeUndefined();

    // Re-log-in cardless voter
    act(() => {
      assert(isPollworkerAuth(result.current));
      result.current.activateCardlessVoter(
        cardlessVoter.precinctId,
        cardlessVoter.ballotStyleId
      );
    });
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();

    // Cardless voter can log out themselves
    act(() => {
      assert(isCardlessVoterAuth(result.current));
      result.current.logOut();
    });
    await waitForNextUpdate();
    expect(result.current).toEqual({ status: 'logged_out', reason: 'no_card' });

    // expect(logger.log).toHaveBeenCalledTimes(5);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.AuthLogin,
      'pollworker',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthLogin,
      'cardless_voter',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.AuthLogin,
      'pollworker',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.AuthLogin,
      'cardless_voter',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
      LogEventId.AuthLogout,
      'cardless_voter',
      expect.objectContaining({ disposition: 'success' })
    );
  });
});
