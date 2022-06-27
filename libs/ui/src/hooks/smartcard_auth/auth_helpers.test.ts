import { renderHook } from '@testing-library/react-hooks';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { Inserted, Dipped, makePollWorkerCard } from '@votingworks/test-utils';
import { ElectionDefinitionSchema, err, UserRole } from '@votingworks/types';
import { MemoryCard, assert } from '@votingworks/utils';
import {
  isSuperadminAuth,
  isAdminAuth,
  isPollworkerAuth,
  isVoterAuth,
  CARD_POLLING_INTERVAL,
} from './auth_helpers';
import { useInsertedSmartcardAuth } from './use_inserted_smartcard_auth';

const electionDefinition = electionSampleDefinition;
const { electionHash } = electionDefinition;

const allowedUserRoles: UserRole[] = [
  'superadmin',
  'admin',
  'pollworker',
  'voter',
  'cardless_voter',
];

describe('Card interface', () => {
  beforeAll(() => jest.useFakeTimers());

  it('reads, writes, and clears stored data', async () => {
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

describe('Type guards', () => {
  test('isSuperadminAuth', () => {
    expect(isSuperadminAuth(Inserted.fakeSuperadminAuth())).toBe(true);
    expect(isSuperadminAuth(Inserted.fakeVoterAuth())).toBe(false);
    expect(isSuperadminAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
    expect(isSuperadminAuth(Dipped.fakeSuperadminAuth())).toBe(true);
    expect(isSuperadminAuth(Dipped.fakeAdminAuth())).toBe(false);
    expect(isSuperadminAuth(Dipped.fakeLoggedOutAuth())).toBe(false);
  });

  test('isAdminAuth', () => {
    expect(isAdminAuth(Inserted.fakeAdminAuth())).toBe(true);
    expect(isAdminAuth(Inserted.fakeVoterAuth())).toBe(false);
    expect(isAdminAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
    expect(isAdminAuth(Dipped.fakeAdminAuth())).toBe(true);
    expect(isAdminAuth(Dipped.fakeSuperadminAuth())).toBe(false);
    expect(isAdminAuth(Dipped.fakeLoggedOutAuth())).toBe(false);
  });

  test('isPollworkerAuth', () => {
    expect(isPollworkerAuth(Inserted.fakePollworkerAuth())).toBe(true);
    expect(isPollworkerAuth(Inserted.fakeVoterAuth())).toBe(false);
    expect(isPollworkerAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
  });

  test('isVoterAuth', () => {
    expect(isVoterAuth(Inserted.fakeVoterAuth())).toBe(true);
    expect(isVoterAuth(Inserted.fakePollworkerAuth())).toBe(false);
    expect(isVoterAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
  });
});
