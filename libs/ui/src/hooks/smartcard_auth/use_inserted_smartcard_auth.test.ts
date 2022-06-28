import { act, renderHook } from '@testing-library/react-hooks';
import {
  electionSample2Definition,
  electionSampleDefinition,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
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
    const cardApi = new MemoryCard();
    cardApi.insertCard(undefined, undefined, 'error');
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
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
  });

  it('returns logged_out auth when the card is not programmed correctly', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });

    cardApi.insertCard('invalid card data');
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'invalid_user_on_card',
    });
  });

  it('returns logged_out auth when the card user role is not allowed', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles: ['superadmin', 'admin'],
        scope: { electionDefinition },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'user_role_not_allowed',
    });
  });

  it('returns logged_out auth when using a pollworker card if the machine is not configured', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'machine_not_configured',
    });
  });

  it('returns logged_out auth when using a pollworker card that doesnt match the configured election', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition: electionSample2Definition },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'pollworker_wrong_election',
    });
  });

  it('returns logged_out auth when using a voter card that has expired', async () => {
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
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_expired',
    });
  });

  it('returns logged_out auth when using a voter card if the machine is not configured', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'machine_not_configured',
    });
  });

  it('returns logged_out auth when using a voter card with a ballot style that doesnt match the configured election', async () => {
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
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_wrong_election',
    });
  });

  it('returns logged_out auth when using a voter card with a precinct that doesnt match the configured election', async () => {
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
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_wrong_election',
    });
  });

  it('returns logged_out auth when using a voter card with a precinct that doesnt match the configured precinct', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(
      makeVoterCard(election, { pr: election.precincts[1].id })
    );
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_wrong_precinct',
    });
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
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election, { uz: 1 }));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_voided',
    });
  });

  it('returns logged_out auth for a printed voter card', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeVoterCard(election, { bp: 1 }));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition, precinct },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_printed',
    });
  });

  it('returns logged_in auth for a superadmin card', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakeSuperadminUser(),
      card: expect.any(Object),
    });
  });

  it('returns logged_in auth for an admin card', async () => {
    const cardApi = new MemoryCard();
    const passcode = '123456';
    cardApi.insertCard(makeAdminCard(electionHash, passcode));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakeAdminUser({ electionHash, passcode }),
      card: expect.any(Object),
    });
  });

  it('returns logged_in auth for a pollworker card', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition },
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakePollworkerUser({ electionHash }),
      card: expect.any(Object),
    });
  });

  it('returns logged_in auth for a voter card', async () => {
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
  });

  it('for a logged in voter, marks the voter card voided', async () => {
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
    await result.current.markCardVoided();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'voter_card_voided',
    });
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
    await result.current.markCardPrinted();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    // Shouldn't log out until card removed
    expect(result.current.status).toEqual('logged_in');
    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.status).toEqual('logged_out');
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
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: {},
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakeSuperadminUser(),
      card: expect.any(Object),
    });

    cardApi.removeCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({ status: 'logged_out', reason: 'no_card' });
  });

  it('for a logged in pollworker, activates and deactivates a cardless voter session', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useInsertedSmartcardAuth({
        cardApi,
        allowedUserRoles,
        scope: { electionDefinition },
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
  });
});
