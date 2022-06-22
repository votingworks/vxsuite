import { act, renderHook } from '@testing-library/react-hooks';
import {
  electionSample2Definition,
  electionSampleDefinition,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import {
  fakeSuperadminAuth,
  fakeVoterAuth,
  fakeLoggedOutAuth,
  fakeAdminAuth,
  fakePollworkerAuth,
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
  ElectionDefinitionSchema,
  err,
  PrecinctSelection,
  PrecinctSelectionKind,
  UserRole,
} from '@votingworks/types';
import { assert, MemoryCard, utcTimestamp } from '@votingworks/utils';
import { CARD_POLLING_INTERVAL } from './use_smartcard';
import {
  isAdminAuth,
  isCardlessVoterAuth,
  isPollworkerAuth,
  isSuperadminAuth,
  isVoterAuth,
  useSmartcardAuth,
  VOTER_CARD_EXPIRATION_SECONDS,
} from './use_smartcard_auth';

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

describe('useSmartcardAuth', () => {
  beforeEach(() => jest.useFakeTimers());

  it("returns logged_out auth when there's no card or a card error", async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(undefined, undefined, 'error');
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
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
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
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
      useSmartcardAuth({
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

  it('returns logged_out auth when the user role is not allowed', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({
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
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
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
    cardApi.insertCard(makeAdminCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toMatchObject({
      status: 'logged_in',
      user: fakeAdminUser({ electionHash }),
      card: expect.any(Object),
    });
  });

  it('returns logged_in auth for a pollworker card', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makePollWorkerCard(electionHash));
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({
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
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
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
      useSmartcardAuth({
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

describe('Card interface', () => {
  it('reads, writes, and clears stored data', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isSuperadminAuth(result.current));

    // Initially, there's no data stored on the card, so reading should return undefined
    expect(result.current.card.hasStoredData).toBe(false);
    expect((await result.current.card.readStoredString()).ok()).toBeUndefined();
    expect(
      (await result.current.card.readStoredUint8Array()).ok()
    ).toBeUndefined();
    expect(
      (
        await result.current.card.readStoredObject(ElectionDefinitionSchema)
      ).ok()
    ).toBeUndefined();

    // Try writing an object to the card
    await result.current.card.writeStoredData(electionDefinition);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();

    // Now reading should return the written data
    expect(result.current.card.hasStoredData).toBe(true);
    expect((await result.current.card.readStoredString()).ok()).toEqual(
      JSON.stringify(electionDefinition)
    );
    expect(
      (
        await result.current.card.readStoredObject(ElectionDefinitionSchema)
      ).ok()
    ).toEqual(electionDefinition);
    expect((await result.current.card.readStoredUint8Array()).ok()).toEqual(
      new TextEncoder().encode(JSON.stringify(electionDefinition))
    );

    // Try writing a binary value to the card
    await result.current.card.writeStoredData(Uint8Array.of(1, 2, 3));
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();

    // Reading should return the written data
    expect((await result.current.card.readStoredString()).ok()).toEqual(
      new TextDecoder().decode(Uint8Array.of(1, 2, 3))
    );
    expect(
      (
        await result.current.card.readStoredObject(ElectionDefinitionSchema)
      ).ok()
    ).toBeUndefined();
    expect((await result.current.card.readStoredUint8Array()).ok()).toEqual(
      Uint8Array.of(1, 2, 3)
    );

    // Next, clear the data
    await result.current.card.clearStoredData();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();

    // Data should read as undefined again
    expect(result.current.card.hasStoredData).toBe(false);
    expect((await result.current.card.readStoredString()).ok()).toBeUndefined();
    expect(
      (await result.current.card.readStoredUint8Array()).ok()
    ).toBeUndefined();
    expect(
      (
        await result.current.card.readStoredObject(ElectionDefinitionSchema)
      ).ok()
    ).toBeUndefined();
  });

  it('handles errors when reading, writing, or clearing data', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isSuperadminAuth(result.current));

    const error = new Error('test error');

    jest.spyOn(cardApi, 'readLongString').mockRejectedValue(error);
    expect((await result.current.card.readStoredString()).err()).toEqual(error);

    jest.spyOn(cardApi, 'readLongUint8Array').mockRejectedValue(error);
    expect((await result.current.card.readStoredUint8Array()).err()).toEqual(
      error
    );

    jest.spyOn(cardApi, 'readLongObject').mockResolvedValue(err(error));
    expect(
      (
        await result.current.card.readStoredObject(ElectionDefinitionSchema)
      ).err()
    ).toEqual(error);

    jest.spyOn(cardApi, 'writeLongObject').mockRejectedValue(error);
    expect(
      (await result.current.card.writeStoredData(electionDefinition)).err()
    ).toEqual(error);

    jest.spyOn(cardApi, 'writeLongUint8Array').mockRejectedValue(error);
    expect(
      (await result.current.card.writeStoredData(Uint8Array.of(1, 2, 3))).err()
    ).toEqual(error);

    expect((await result.current.card.clearStoredData()).err()).toEqual(error);
  });

  it('raises an error on concurrent writes', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles, scope: {} })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(isSuperadminAuth(result.current));

    const [write1, write2] = await Promise.all([
      result.current.card.writeStoredData(electionDefinition),
      result.current.card.writeStoredData(electionDefinition),
    ]);

    expect(write1.isErr()).toBe(false);
    expect(write2.isErr()).toBe(true);
    expect(write2.err()?.message).toEqual('Card write in progress');

    const [write3, clear4] = await Promise.all([
      result.current.card.writeStoredData(electionDefinition),
      result.current.card.clearStoredData(),
    ]);
    expect(write3.isErr()).toBe(false);
    expect(clear4.isErr()).toBe(true);
    expect(clear4.err()?.message).toEqual('Card write in progress');

    // Make sure failed writes still release the lock
    jest
      .spyOn(cardApi, 'writeLongObject')
      .mockRejectedValue(new Error('error'));
    expect(
      (await result.current.card.writeStoredData(electionDefinition)).isErr()
    ).toBe(true);
    expect((await result.current.card.clearStoredData()).isOk()).toBe(true);
  });
});

test('isSuperadminAuth', () => {
  expect(isSuperadminAuth(fakeSuperadminAuth())).toBe(true);
  expect(isSuperadminAuth(fakeVoterAuth())).toBe(false);
  expect(isSuperadminAuth(fakeLoggedOutAuth())).toBe(false);
});

test('isAdminAuth', () => {
  expect(isAdminAuth(fakeAdminAuth())).toBe(true);
  expect(isAdminAuth(fakeVoterAuth())).toBe(false);
  expect(isAdminAuth(fakeLoggedOutAuth())).toBe(false);
});

test('isPollworkerAuth', () => {
  expect(isPollworkerAuth(fakePollworkerAuth())).toBe(true);
  expect(isPollworkerAuth(fakeVoterAuth())).toBe(false);
  expect(isPollworkerAuth(fakeLoggedOutAuth())).toBe(false);
});

test('isVoterAuth', () => {
  expect(isVoterAuth(fakeVoterAuth())).toBe(true);
  expect(isVoterAuth(fakePollworkerAuth())).toBe(false);
  expect(isVoterAuth(fakeLoggedOutAuth())).toBe(false);
});
