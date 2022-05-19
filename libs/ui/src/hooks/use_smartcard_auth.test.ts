import { renderHook } from '@testing-library/react-hooks';
import {
  electionSample2Definition,
  electionSampleDefinition,
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
} from '@votingworks/test-utils';
import { ElectionDefinitionSchema, err, UserRole } from '@votingworks/types';
import { assert, MemoryCard } from '@votingworks/utils';
import { CARD_POLLING_INTERVAL } from './use_smartcard';
import {
  isAdminAuth,
  isPollworkerAuth,
  isSuperadminAuth,
  isVoterAuth,
  useSmartcardAuth,
} from './use_smartcard_auth';

const allowedUserRoles: UserRole[] = [
  'superadmin',
  'admin',
  'pollworker',
  'voter',
];

const electionDefinition = electionSampleDefinition;
const { electionHash, election } = electionDefinition;

describe('useSmartcardAuth', () => {
  beforeEach(() => jest.useFakeTimers());

  it("returns logged_out auth when there's no card or a card error", async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(undefined, undefined, 'error');
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles })
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
      useSmartcardAuth({ cardApi, allowedUserRoles })
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
        electionDefinition,
        allowedUserRoles: ['superadmin', 'admin'],
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
        electionDefinition,
        allowedUserRoles: ['superadmin', 'admin'],
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
      useSmartcardAuth({ cardApi, allowedUserRoles })
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
        electionDefinition: electionSample2Definition,
      })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current).toEqual({
      status: 'logged_out',
      reason: 'pollworker_election_hash_mismatch',
    });
  });

  it('returns logged_in auth for a superadmin card', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles })
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
      useSmartcardAuth({ cardApi, allowedUserRoles })
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
      useSmartcardAuth({ cardApi, allowedUserRoles, electionDefinition })
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
      useSmartcardAuth({ cardApi, allowedUserRoles, electionDefinition })
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
    });
  });

  it('logs out user when card is removed', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles })
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
});

describe('Card interface', () => {
  it('reads, writes, and clears stored data', async () => {
    const cardApi = new MemoryCard();
    cardApi.insertCard(makeSuperadminCard());
    const { result, waitForNextUpdate } = renderHook(() =>
      useSmartcardAuth({ cardApi, allowedUserRoles })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(result.current.status === 'logged_in');

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
      useSmartcardAuth({ cardApi, allowedUserRoles })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(result.current.status === 'logged_in');

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
      useSmartcardAuth({ cardApi, allowedUserRoles })
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    assert(result.current.status === 'logged_in');

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
