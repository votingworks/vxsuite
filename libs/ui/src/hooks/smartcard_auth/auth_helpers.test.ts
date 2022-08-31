import { act } from '@testing-library/react';
import { renderHook, RenderResult } from '@testing-library/react-hooks';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import {
  Inserted,
  Dipped,
  makePollWorkerCard,
  makeSystemAdministratorCard,
} from '@votingworks/test-utils';
import {
  CardProgramming,
  CardStorage,
  DippedSmartcardAuth,
  ElectionDefinitionSchema,
  err,
  UserRole,
} from '@votingworks/types';
import { MemoryCard, assert } from '@votingworks/utils';
import {
  isSystemAdministratorAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
  isVoterAuth,
} from './auth_helpers';
import { useDippedSmartcardAuth } from './use_dipped_smartcard_auth';
import { useInsertedSmartcardAuth } from './use_inserted_smartcard_auth';

const electionDefinition = electionSampleDefinition;
const { electionData, electionHash } = electionDefinition;

const allowedUserRoles: UserRole[] = [
  'system_administrator',
  'election_manager',
  'poll_worker',
  'voter',
  'cardless_voter',
];

function assertAndGetPostDipCard(
  result: RenderResult<DippedSmartcardAuth.Auth>
): CardStorage & CardProgramming {
  assert(isSystemAdministratorAuth(result.current));
  const { card } = result.current;
  expect(card).not.toEqual('no_card');
  assert(card !== 'no_card');
  expect(card).not.toEqual('error');
  assert(card !== 'error');
  return card;
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
    await waitForNextUpdate();
    assert(isPollWorkerAuth(result.current));

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
    await waitForNextUpdate();
    assert(isPollWorkerAuth(result.current));

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
    await waitForNextUpdate();
    assert(isPollWorkerAuth(result.current));

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
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );

    // Auth as a system administrator
    cardApi.insertCard(makeSystemAdministratorCard());
    await waitForNextUpdate();
    expect(result.current.status).toEqual('checking_passcode');
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode('123456');
    });
    await waitForNextUpdate();
    expect(result.current.status).toEqual('remove_card');
    cardApi.removeCard();
    await waitForNextUpdate();
    assert(isSystemAdministratorAuth(result.current));

    // Insert an unprogrammed card
    expect(result.current.card).toEqual('no_card');
    cardApi.insertCard();
    await waitForNextUpdate();
    let card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).not.toBeDefined();
    expect(card.programUser).toBeDefined();
    expect(card.unprogramUser).toBeDefined();

    // Program a system administrator card
    expect(
      (
        await card.programUser({
          role: 'system_administrator',
          passcode: '123456',
        })
      ).isOk()
    ).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).toEqual({
      role: 'system_administrator',
      passcode: '123456',
    });
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.SmartcardProgramInit,
      'system_administrator',
      {
        message: 'Programming system_administrator smartcard...',
        programmedUserRole: 'system_administrator',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.SmartcardProgramComplete,
      'system_administrator',
      {
        disposition: 'success',
        message: 'Successfully programmed system_administrator smartcard.',
        programmedUserRole: 'system_administrator',
      }
    );

    // Unprogram the card
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      5,
      LogEventId.SmartcardUnprogramInit,
      'system_administrator',
      {
        message: 'Unprogramming system_administrator smartcard...',
        programmedUserRole: 'system_administrator',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      6,
      LogEventId.SmartcardUnprogramComplete,
      'system_administrator',
      {
        disposition: 'success',
        message: 'Successfully unprogrammed system_administrator smartcard.',
        previousProgrammedUserRole: 'system_administrator',
      }
    );

    // Program an election manager card
    expect(
      (
        await card.programUser({
          role: 'election_manager',
          electionHash,
          passcode: '000000',
          electionData,
        })
      ).isOk()
    ).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).toEqual({
      role: 'election_manager',
      electionHash,
      passcode: '000000',
    });
    expect(card.hasStoredData).toEqual(true);
    expect((await card.readStoredString()).ok()).toEqual(electionData);
    expect(logger.log).toHaveBeenNthCalledWith(
      7,
      LogEventId.SmartcardProgramInit,
      'system_administrator',
      {
        message: 'Programming election_manager smartcard...',
        programmedUserRole: 'election_manager',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      8,
      LogEventId.SmartcardProgramComplete,
      'system_administrator',
      {
        disposition: 'success',
        message: 'Successfully programmed election_manager smartcard.',
        programmedUserRole: 'election_manager',
      }
    );

    // Unprogram the card
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      9,
      LogEventId.SmartcardUnprogramInit,
      'system_administrator',
      {
        message: 'Unprogramming election_manager smartcard...',
        programmedUserRole: 'election_manager',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      10,
      LogEventId.SmartcardUnprogramComplete,
      'system_administrator',
      {
        disposition: 'success',
        message: 'Successfully unprogrammed election_manager smartcard.',
        previousProgrammedUserRole: 'election_manager',
      }
    );

    // Program a poll worker card
    expect(
      (await card.programUser({ role: 'poll_worker', electionHash })).isOk()
    ).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).toEqual({
      role: 'poll_worker',
      electionHash,
    });
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      11,
      LogEventId.SmartcardProgramInit,
      'system_administrator',
      {
        message: 'Programming poll_worker smartcard...',
        programmedUserRole: 'poll_worker',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      12,
      LogEventId.SmartcardProgramComplete,
      'system_administrator',
      {
        disposition: 'success',
        message: 'Successfully programmed poll_worker smartcard.',
        programmedUserRole: 'poll_worker',
      }
    );

    // Unprogram the card
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      13,
      LogEventId.SmartcardUnprogramInit,
      'system_administrator',
      {
        message: 'Unprogramming poll_worker smartcard...',
        programmedUserRole: 'poll_worker',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      14,
      LogEventId.SmartcardUnprogramComplete,
      'system_administrator',
      {
        disposition: 'success',
        message: 'Successfully unprogrammed poll_worker smartcard.',
        previousProgrammedUserRole: 'poll_worker',
      }
    );

    // Unprogram the card again to verify that attempting to unprogram an already unprogrammed card
    // doesn't cause problems
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
    expect(logger.log).toHaveBeenNthCalledWith(
      15,
      LogEventId.SmartcardUnprogramInit,
      'system_administrator',
      {
        message: 'Unprogramming unprogrammed smartcard...',
        programmedUserRole: 'unprogrammed',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      16,
      LogEventId.SmartcardUnprogramComplete,
      'system_administrator',
      {
        disposition: 'success',
        message: 'Smartcard already unprogrammed (no-op).',
        previousProgrammedUserRole: 'unprogrammed',
      }
    );
  });

  it('raises an error on concurrent programming requests', async () => {
    const cardApi = new MemoryCard();
    const logger = fakeLogger();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );

    // Auth as a system administrator
    cardApi.insertCard(makeSystemAdministratorCard());
    await waitForNextUpdate();
    expect(result.current.status).toEqual('checking_passcode');
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode('123456');
    });
    await waitForNextUpdate();
    expect(result.current.status).toEqual('remove_card');
    cardApi.removeCard();
    await waitForNextUpdate();

    // Insert an unprogrammed card
    cardApi.insertCard();
    await waitForNextUpdate();
    let card = assertAndGetPostDipCard(result);

    // Make concurrent programming requests
    const [write1, write2] = await Promise.all([
      card.programUser({ role: 'system_administrator', passcode: '123456' }),
      card.programUser({ role: 'poll_worker', electionHash }),
    ]);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
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
      'system_administrator',
      expect.objectContaining({ disposition: 'failure' })
    );

    // Make concurrent unprogramming requests
    const [write3, write4] = await Promise.all([
      card.unprogramUser(),
      card.unprogramUser(),
    ]);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
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
      'system_administrator',
      expect.objectContaining({ disposition: 'failure' })
    );

    // Program the card in prep for one last test case involving unprogramming
    expect(
      (
        await card.programUser({
          role: 'system_administrator',
          passcode: '123456',
        })
      ).isOk()
    ).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);

    // Make concurrent programming and unprogramming requests
    const [write5, write6] = await Promise.all([
      card.programUser({ role: 'system_administrator', passcode: '123456' }),
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
      useDippedSmartcardAuth({
        cardApi,
        logger,
        scope: { electionDefinition },
      })
    );

    // Auth as a system administrator
    cardApi.insertCard(makeSystemAdministratorCard());
    await waitForNextUpdate();
    expect(result.current.status).toEqual('checking_passcode');
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode('123456');
    });
    await waitForNextUpdate();
    expect(result.current.status).toEqual('remove_card');
    cardApi.removeCard();
    await waitForNextUpdate();

    // Insert an unprogrammed card
    cardApi.insertCard();
    await waitForNextUpdate();
    let card = assertAndGetPostDipCard(result);

    // Verify that card programming errors are handled
    const error = new Error('Test error');
    let spy = jest
      .spyOn(cardApi, 'overrideWriteProtection')
      .mockRejectedValue(error);
    expect(
      (
        await card.programUser({
          role: 'system_administrator',
          passcode: '123456',
        })
      ).err()
    ).toEqual(error);
    expect(logger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.SmartcardProgramInit,
      'system_administrator',
      {
        message: 'Programming system_administrator smartcard...',
        programmedUserRole: 'system_administrator',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.SmartcardProgramComplete,
      'system_administrator',
      {
        disposition: 'failure',
        message: 'Error programming system_administrator smartcard.',
        programmedUserRole: 'system_administrator',
      }
    );

    // Verify that failed writes still release the lock
    spy.mockRestore();
    expect(
      (
        await card.programUser({
          role: 'system_administrator',
          passcode: '123456',
        })
      ).isOk()
    ).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);

    // Verify that card unprogramming errors are handled
    spy = jest
      .spyOn(cardApi, 'overrideWriteProtection')
      .mockRejectedValue(error);
    expect((await card.unprogramUser()).err()).toEqual(error);
    expect(logger.log).toHaveBeenNthCalledWith(
      7,
      LogEventId.SmartcardUnprogramInit,
      'system_administrator',
      {
        message: 'Unprogramming system_administrator smartcard...',
        programmedUserRole: 'system_administrator',
      }
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      8,
      LogEventId.SmartcardUnprogramComplete,
      'system_administrator',
      {
        disposition: 'failure',
        message: 'Error unprogramming system_administrator smartcard.',
        programmedUserRole: 'system_administrator',
      }
    );

    // Verify that failed writes still release the lock
    spy.mockRestore();
    expect((await card.unprogramUser()).isOk()).toEqual(true);
  });

  it('can program and unprogram cards without a logger', async () => {
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger: undefined,
        scope: { electionDefinition },
      })
    );

    // Auth as a system administrator
    cardApi.insertCard(makeSystemAdministratorCard());
    await waitForNextUpdate();
    expect(result.current.status).toEqual('checking_passcode');
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode('123456');
    });
    await waitForNextUpdate();
    expect(result.current.status).toEqual('remove_card');
    cardApi.removeCard();
    await waitForNextUpdate();

    // Insert an unprogrammed card
    cardApi.insertCard();
    await waitForNextUpdate();
    let card = assertAndGetPostDipCard(result);

    // Program a system administrator card
    expect(
      (
        await card.programUser({
          role: 'system_administrator',
          passcode: '123456',
        })
      ).isOk()
    ).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).toEqual({
      role: 'system_administrator',
      passcode: '123456',
    });
    expect(card.hasStoredData).toEqual(false);

    // Unprogram the card
    expect((await card.unprogramUser()).isOk()).toEqual(true);
    await waitForNextUpdate();
    card = assertAndGetPostDipCard(result);
    expect(card.programmedUser).not.toBeDefined();
    expect(card.hasStoredData).toEqual(false);
  });

  it('can notice a backward card after logging in', async () => {
    const cardApi = new MemoryCard();
    const { result, waitForNextUpdate } = renderHook(() =>
      useDippedSmartcardAuth({
        cardApi,
        logger: undefined,
        scope: { electionDefinition },
      })
    );

    // Auth as a system administrator
    cardApi.insertCard(makeSystemAdministratorCard());
    await waitForNextUpdate();
    act(() => {
      assert(result.current.status === 'checking_passcode');
      result.current.checkPasscode('123456');
    });
    await waitForNextUpdate();
    cardApi.removeCard();
    await waitForNextUpdate();
    assert(isSystemAdministratorAuth(result.current));

    // Insert an card
    cardApi.insertCard(undefined, undefined, 'error');
    await waitForNextUpdate();
    expect(result.current.card).toEqual('error');
  });
});

describe('Type guards', () => {
  test('isSystemAdministratorAuth', () => {
    expect(
      isSystemAdministratorAuth(Inserted.fakeSystemAdministratorAuth())
    ).toBe(true);
    expect(isSystemAdministratorAuth(Inserted.fakeVoterAuth())).toBe(false);
    expect(isSystemAdministratorAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
    expect(
      isSystemAdministratorAuth(Dipped.fakeSystemAdministratorAuth())
    ).toBe(true);
    expect(isSystemAdministratorAuth(Dipped.fakeElectionManagerAuth())).toBe(
      false
    );
    expect(isSystemAdministratorAuth(Dipped.fakeLoggedOutAuth())).toBe(false);
  });

  test('isElectionManagerAuth', () => {
    expect(isElectionManagerAuth(Inserted.fakeElectionManagerAuth())).toBe(
      true
    );
    expect(isElectionManagerAuth(Inserted.fakeVoterAuth())).toBe(false);
    expect(isElectionManagerAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
    expect(isElectionManagerAuth(Dipped.fakeElectionManagerAuth())).toBe(true);
    expect(isElectionManagerAuth(Dipped.fakeSystemAdministratorAuth())).toBe(
      false
    );
    expect(isElectionManagerAuth(Dipped.fakeLoggedOutAuth())).toBe(false);
  });

  test('isPollWorkerAuth', () => {
    expect(isPollWorkerAuth(Inserted.fakePollWorkerAuth())).toBe(true);
    expect(isPollWorkerAuth(Inserted.fakeVoterAuth())).toBe(false);
    expect(isPollWorkerAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
  });

  test('isVoterAuth', () => {
    expect(isVoterAuth(Inserted.fakeVoterAuth())).toBe(true);
    expect(isVoterAuth(Inserted.fakePollWorkerAuth())).toBe(false);
    expect(isVoterAuth(Inserted.fakeLoggedOutAuth())).toBe(false);
  });
});
