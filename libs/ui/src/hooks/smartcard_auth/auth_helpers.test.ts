import { renderHook } from '@testing-library/react-hooks';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import {
  Inserted,
  Dipped,
  makePollWorkerCard,
  makeSuperadminCard,
} from '@votingworks/test-utils';
import { ElectionDefinitionSchema, err, UserRole } from '@votingworks/types';
import { MemoryCard, assert } from '@votingworks/utils';
import {
  isSuperadminAuth,
  isAdminAuth,
  isPollworkerAuth,
  isVoterAuth,
  CARD_POLLING_INTERVAL,
} from './auth_helpers';
import { useDippedSmartcardAuth } from './use_dipped_smartcard_auth';
import { useInsertedSmartcardAuth } from './use_inserted_smartcard_auth';

const electionDefinition = electionSampleDefinition;
const { electionData, electionHash } = electionDefinition;

const allowedUserRoles: UserRole[] = [
  'superadmin',
  'admin',
  'pollworker',
  'voter',
  'cardless_voter',
];

function authAsSuperAdmin(cardApi: MemoryCard) {
  cardApi.insertCard(makeSuperadminCard());
  jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
  cardApi.removeCard();
  jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
}

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

  it('raises an error on concurrent storage writes', async () => {
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

  it('programs and unprograms cards', async () => {
    const cardApi = new MemoryCard();
    const logger = fakeLogger();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
    );
    authAsSuperAdmin(cardApi);
    await waitForNextUpdate();
    assert(isSuperadminAuth(result.current));

    // Insert an unprogrammed card
    expect(result.current.card).not.toBeDefined();
    cardApi.insertCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    let card = result.current.card!;
    expect(card.programmedUser).not.toBeDefined();
    expect(card.programUser).toBeDefined();
    expect(card.unprogramUser).toBeDefined();

    // Program a super admin card
    expect((await card.programUser({ role: 'superadmin' })).isOk()).toEqual(
      true
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(card.programmedUser).toEqual({ role: 'superadmin' });
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.SmartcardProgramInit,
      'superadmin',
      {
        message: 'Programming superadmin smartcard...',
        programmedUserRole: 'superadmin',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.SmartcardProgramComplete,
      'superadmin',
      {
        disposition: 'success',
        message: 'Successfully programmed superadmin smartcard.',
        programmedUserRole: 'superadmin',
      }
    );

    // Unprogram the card
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.SmartcardUnprogramInit,
      'superadmin',
      {
        message: 'Unprogramming superadmin smartcard...',
        programmedUserRole: 'superadmin',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
      LogEventId.SmartcardUnprogramComplete,
      'superadmin',
      {
        disposition: 'success',
        message: 'Successfully unprogrammed superadmin smartcard.',
        previousProgrammedUserRole: 'superadmin',
      }
    );

    // Program an admin card
    expect(
      (
        await card.programUser({
          role: 'admin',
          electionHash,
          passcode: '000000',
          electionData,
        })
      ).isOk()
    ).toEqual(true);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(card.programmedUser).toEqual({
      role: 'admin',
      electionHash,
      passcode: '000000',
    });
    expect(card.hasStoredData).toEqual(true);
    expect((await card.readStoredString()).ok()).toEqual(electionData);
    expect(logger.log).toHaveBeenNthCalledWith(
      6,
      LogEventId.SmartcardProgramInit,
      'superadmin',
      {
        message: 'Programming admin smartcard...',
        programmedUserRole: 'admin',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      7,
      LogEventId.SmartcardProgramComplete,
      'superadmin',
      {
        disposition: 'success',
        message: 'Successfully programmed admin smartcard.',
        programmedUserRole: 'admin',
      }
    );

    // Unprogram the card
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      8,
      LogEventId.SmartcardUnprogramInit,
      'superadmin',
      {
        message: 'Unprogramming admin smartcard...',
        programmedUserRole: 'admin',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      9,
      LogEventId.SmartcardUnprogramComplete,
      'superadmin',
      {
        disposition: 'success',
        message: 'Successfully unprogrammed admin smartcard.',
        previousProgrammedUserRole: 'admin',
      }
    );

    // Program a poll worker card
    expect(
      (await card.programUser({ role: 'pollworker', electionHash })).isOk()
    ).toEqual(true);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(card.programmedUser).toEqual({
      role: 'pollworker',
      electionHash,
    });
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      10,
      LogEventId.SmartcardProgramInit,
      'superadmin',
      {
        message: 'Programming pollworker smartcard...',
        programmedUserRole: 'pollworker',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      11,
      LogEventId.SmartcardProgramComplete,
      'superadmin',
      {
        disposition: 'success',
        message: 'Successfully programmed pollworker smartcard.',
        programmedUserRole: 'pollworker',
      }
    );

    // Unprogram the card
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      12,
      LogEventId.SmartcardUnprogramInit,
      'superadmin',
      {
        message: 'Unprogramming pollworker smartcard...',
        programmedUserRole: 'pollworker',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      13,
      LogEventId.SmartcardUnprogramComplete,
      'superadmin',
      {
        disposition: 'success',
        message: 'Successfully unprogrammed pollworker smartcard.',
        previousProgrammedUserRole: 'pollworker',
      }
    );

    // Unprogram the card again to verify that attempting to unprogram an already unprogrammed card
    // doesn't cause problems
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenCalledTimes(13); // Expect no additional logs since this is a no-op
  });

  it('raises an error on concurrent programming requests', async () => {
    const cardApi = new MemoryCard();
    const logger = fakeLogger();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
    );
    authAsSuperAdmin(cardApi);
    await waitForNextUpdate();
    assert(isSuperadminAuth(result.current));

    // Insert an unprogrammed card
    cardApi.insertCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    let card = result.current.card!;

    // Make concurrent programming requests
    const [write1, write2] = await Promise.all([
      card.programUser({ role: 'superadmin' }),
      card.programUser({ role: 'pollworker', electionHash }),
    ]);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(
      (write1.isErr() && !write2.isErr()) || (!write1.isErr() && write2.isErr())
    ).toEqual(true);
    if (write1.isErr()) {
      expect(write1.err()?.message).toEqual('Card write in progress');
    } else {
      expect(write2.err()?.message).toEqual('Card write in progress');
    }
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.SmartcardProgramComplete,
      'superadmin',
      expect.objectContaining({ disposition: 'failure' })
    );

    // Make concurrent unprogramming requests
    const [write3, write4] = await Promise.all([
      card.unprogramUser(),
      card.unprogramUser(),
    ]);
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;
    expect(
      (write3.isErr() && !write4.isErr()) || (!write3.isErr() && write4.isErr())
    ).toEqual(true);
    if (write3.isErr()) {
      expect(write3.err()?.message).toEqual('Card write in progress');
    } else {
      expect(write4.err()?.message).toEqual('Card write in progress');
    }
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.SmartcardUnprogramComplete,
      'superadmin',
      expect.objectContaining({ disposition: 'failure' })
    );

    // Program the card in prep for one last test case involving unprogramming
    expect((await card.programUser({ role: 'superadmin' })).isOk()).toEqual(
      true
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;

    // Make concurrent programming and unprogramming requests
    const [write5, write6] = await Promise.all([
      card.programUser({ role: 'superadmin' }),
      card.unprogramUser(),
    ]);
    expect(
      (write5.isErr() && !write6.isErr()) || (!write5.isErr() && write6.isErr())
    ).toEqual(true);
    if (write5.isErr()) {
      expect(write5.err()?.message).toEqual('Card write in progress');
    } else {
      expect(write6.err()?.message).toEqual('Card write in progress');
    }
  });

  it('handles errors when programming and unprogramming cards', async () => {
    const cardApi = new MemoryCard();
    const logger = fakeLogger();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({ cardApi, logger })
    );
    authAsSuperAdmin(cardApi);
    await waitForNextUpdate();
    assert(isSuperadminAuth(result.current));

    // Insert an unprogrammed card
    cardApi.insertCard();
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    let card = result.current.card!;

    // Verify that card programming errors are handled
    const error = new Error('Test error');
    let spy = jest
      .spyOn(cardApi, 'overrideWriteProtection')
      .mockRejectedValue(error);
    expect((await card.programUser({ role: 'superadmin' })).err()).toEqual(
      error
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.SmartcardProgramInit,
      'superadmin',
      {
        message: 'Programming superadmin smartcard...',
        programmedUserRole: 'superadmin',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.SmartcardProgramComplete,
      'superadmin',
      {
        disposition: 'failure',
        message: 'Error programming superadmin smartcard.',
        programmedUserRole: 'superadmin',
      }
    );

    // Verify that failed writes still release the lock
    spy.mockRestore();
    expect((await card.programUser({ role: 'superadmin' })).isOk()).toEqual(
      true
    );
    jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
    await waitForNextUpdate();
    expect(result.current.card).toBeDefined();
    card = result.current.card!;

    // Verify that card unprogramming errors are handled
    spy = jest
      .spyOn(cardApi, 'overrideWriteProtection')
      .mockRejectedValue(error);
    expect((await card.unprogramUser()).err()).toEqual(error);
    expect(logger.log).toHaveBeenNthCalledWith(
      6,
      LogEventId.SmartcardUnprogramInit,
      'superadmin',
      {
        message: 'Unprogramming superadmin smartcard...',
        programmedUserRole: 'superadmin',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      7,
      LogEventId.SmartcardUnprogramComplete,
      'superadmin',
      {
        disposition: 'failure',
        message: 'Error unprogramming superadmin smartcard.',
        programmedUserRole: 'superadmin',
      }
    );

    // Verify that failed writes still release the lock
    spy.mockRestore();
    expect((await card.unprogramUser()).isOk()).toEqual(true);
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
