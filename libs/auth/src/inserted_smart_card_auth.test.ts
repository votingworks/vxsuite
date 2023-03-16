import { Buffer } from 'buffer';
import { z } from 'zod';
import { err, ok } from '@votingworks/basics';
import {
  electionSample2Definition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {
  fakeLogger,
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import {
  fakeCardlessVoterUser,
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import {
  ElectionSchema,
  InsertedSmartCardAuth as InsertedSmartCardAuthTypes,
  UserWithCard,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  generatePin,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { buildMockCard, MockCard, mockCardAssertComplete } from '../test/utils';
import { CardStatus } from './card';
import { InsertedSmartCardAuth } from './inserted_smart_card_auth';
import {
  InsertedSmartCardAuthConfig,
  InsertedSmartCardAuthMachineState,
} from './inserted_smart_card_auth_api';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  generatePin: jest.fn(),
  isFeatureFlagEnabled: jest.fn(),
}));

const pin = '123456';
const wrongPin = '654321';

let mockCard: MockCard;
let mockLogger: Logger;

beforeEach(() => {
  mockOf(generatePin).mockImplementation(() => pin);
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);

  mockCard = buildMockCard();
  mockLogger = fakeLogger();
});

afterEach(() => {
  mockCardAssertComplete(mockCard);

  // Remove all mock implementations
  jest.resetAllMocks();
});

const { election, electionData, electionHash } = electionSampleDefinition;
const otherElectionHash = electionSample2Definition.electionHash;
const defaultConfig: InsertedSmartCardAuthConfig = {};
const machineState: InsertedSmartCardAuthMachineState = { electionHash };
const systemAdministratorUser = fakeSystemAdministratorUser();
const electionManagerUser = fakeElectionManagerUser({ electionHash });
const pollWorkerUser = fakePollWorkerUser({ electionHash });
const cardlessVoterUser = fakeCardlessVoterUser();

function mockCardStatus(cardStatus: CardStatus) {
  mockCard.getCardStatus.expectRepeatedCallsWith().resolves(cardStatus);
}

async function logInAsElectionManager(auth: InsertedSmartCardAuth) {
  mockCardStatus({ status: 'ready', user: electionManagerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
  });
  mockCard.checkPin.expectCallWith(pin).resolves({ response: 'correct' });
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
  });
  mockOf(mockLogger.log).mockClear();
}

async function logInAsPollWorker(auth: InsertedSmartCardAuth) {
  mockCardStatus({ status: 'ready', user: pollWorkerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: pollWorkerUser,
  });
  mockOf(mockLogger.log).mockClear();
}

test('Card insertions and removals', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  const testSequence: Array<{
    cardStatus: CardStatus;
    expectedAuthStatus: InsertedSmartCardAuthTypes.AuthStatus;
    expectedLog?: Parameters<Logger['log']>;
  }> = [
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'no_card' },
    },
    {
      cardStatus: { status: 'unknown_error' },
      expectedAuthStatus: { status: 'logged_out', reason: 'no_card' },
    },
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'no_card' },
    },
    {
      cardStatus: { status: 'card_error' },
      expectedAuthStatus: { status: 'logged_out', reason: 'card_error' },
      expectedLog: [
        LogEventId.AuthLogin,
        'unknown',
        {
          disposition: LogDispositionStandardTypes.Failure,
          message: 'User failed login.',
          reason: 'card_error',
        },
      ],
    },
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'no_card' },
    },
    {
      cardStatus: { status: 'ready', user: undefined },
      expectedAuthStatus: {
        status: 'logged_out',
        reason: 'invalid_user_on_card',
      },
      expectedLog: [
        LogEventId.AuthLogin,
        'unknown',
        {
          disposition: LogDispositionStandardTypes.Failure,
          message: 'User failed login.',
          reason: 'invalid_user_on_card',
        },
      ],
    },
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'no_card' },
    },
    {
      cardStatus: { status: 'ready', user: systemAdministratorUser },
      expectedAuthStatus: {
        status: 'checking_pin',
        user: systemAdministratorUser,
      },
    },
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'no_card' },
      expectedLog: [
        LogEventId.AuthPinEntry,
        'system_administrator',
        {
          disposition: LogDispositionStandardTypes.Failure,
          message: 'User canceled PIN entry.',
        },
      ],
    },
  ];

  let logIndex = 1;
  for (const { cardStatus, expectedAuthStatus, expectedLog } of testSequence) {
    mockCardStatus(cardStatus);
    expect(await auth.getAuthStatus(machineState)).toEqual(expectedAuthStatus);
    if (expectedLog) {
      expect(mockLogger.log).toHaveBeenNthCalledWith(logIndex, ...expectedLog);
      logIndex += 1;
    }
  }
  expect(mockLogger.log).toHaveBeenCalledTimes(3);
});

test.each<{
  description: string;
  user: UserWithCard;
}>([
  {
    description: 'system administrator',
    user: systemAdministratorUser,
  },
  {
    description: 'election manager',
    user: electionManagerUser,
  },
])('Login and logout for users with PINs - $description', async ({ user }) => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'ready', user });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user,
  });

  mockCard.checkPin
    .expectCallWith(wrongPin)
    .resolves({ response: 'incorrect', numRemainingAttempts: Infinity });
  await auth.checkPin(machineState, { pin: wrongPin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user,
    wrongPinEnteredAt: expect.any(Date),
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(1);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.AuthPinEntry,
    user.role,
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'User entered incorrect PIN.',
    }
  );

  mockCard.checkPin.expectCallWith(pin).resolves({ response: 'correct' });
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(3);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.AuthPinEntry,
    user.role,
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User entered correct PIN.',
    }
  );
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.AuthLogin,
    user.role,
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User logged in.',
    }
  );

  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(4);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.AuthLogout,
    user.role,
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User logged out.',
    }
  );
});

test('Login and logout for users without PINs', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'ready', user: pollWorkerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: pollWorkerUser,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(1);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.AuthLogin,
    'poll_worker',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User logged in.',
    }
  );

  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.AuthLogout,
    'poll_worker',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User logged out.',
    }
  );
});

test.each<{
  description: string;
  config: InsertedSmartCardAuthConfig;
  machineElectionHash?: string;
  user: UserWithCard;
  expectedAuthStatus: InsertedSmartCardAuthTypes.AuthStatus;
  expectedLog?: Parameters<Logger['log']>;
}>([
  {
    description: 'election manager can access unconfigured machine',
    config: defaultConfig,
    machineElectionHash: undefined,
    user: electionManagerUser,
    expectedAuthStatus: {
      status: 'checking_pin',
      user: electionManagerUser,
    },
  },
  {
    description: 'poll worker cannot access unconfigured machine',
    config: defaultConfig,
    machineElectionHash: undefined,
    user: pollWorkerUser,
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'machine_not_configured',
      cardUserRole: 'poll_worker',
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'poll_worker',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'machine_not_configured',
      },
    ],
  },
  {
    description: 'election manager mismatched election hash',
    config: defaultConfig,
    machineElectionHash: otherElectionHash,
    user: electionManagerUser,
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'election_manager_wrong_election',
      cardUserRole: 'election_manager',
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'election_manager',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'election_manager_wrong_election',
      },
    ],
  },
  {
    description: 'poll worker mismatched election hash',
    config: defaultConfig,
    machineElectionHash: otherElectionHash,
    user: pollWorkerUser,
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'poll_worker_wrong_election',
      cardUserRole: 'poll_worker',
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'poll_worker',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'poll_worker_wrong_election',
      },
    ],
  },
  {
    description:
      'election manager mismatched election hash, ' +
      'allowElectionManagersToAccessMachinesConfiguredForOtherElections=true',
    config: {
      ...defaultConfig,
      allowElectionManagersToAccessMachinesConfiguredForOtherElections: true,
    },
    machineElectionHash: otherElectionHash,
    user: electionManagerUser,
    expectedAuthStatus: {
      status: 'checking_pin',
      user: electionManagerUser,
    },
  },
])(
  'Election checks - $description',
  async ({
    config,
    machineElectionHash,
    user,
    expectedAuthStatus,
    expectedLog,
  }) => {
    const auth = new InsertedSmartCardAuth({
      card: mockCard,
      config,
      logger: mockLogger,
    });

    mockCardStatus({ status: 'ready', user });
    expect(
      await auth.getAuthStatus({ electionHash: machineElectionHash })
    ).toEqual(expectedAuthStatus);
    if (expectedLog) {
      expect(mockLogger.log).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenNthCalledWith(1, ...expectedLog);
    }
  }
);

test('Cardless voter sessions - ending preemptively', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: { ...defaultConfig, allowCardlessVoterSessions: true },
    logger: mockLogger,
  });

  await logInAsPollWorker(auth);

  // Start cardless voter session
  await auth.startCardlessVoterSession(machineState, {
    ballotStyleId: cardlessVoterUser.ballotStyleId,
    precinctId: cardlessVoterUser.precinctId,
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: pollWorkerUser,
    cardlessVoterUser,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(1);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.AuthLogin,
    'cardless_voter',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'Cardless voter session started.',
    }
  );

  // End cardless voter session before removing poll worker card
  await auth.endCardlessVoterSession();
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: pollWorkerUser,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.AuthLogout,
    'cardless_voter',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'Cardless voter session ended.',
    }
  );
});

test('Cardless voter sessions - end-to-end', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: { ...defaultConfig, allowCardlessVoterSessions: true },
    logger: mockLogger,
  });

  await logInAsPollWorker(auth);

  // Start cardless voter session
  await auth.startCardlessVoterSession(machineState, {
    ballotStyleId: cardlessVoterUser.ballotStyleId,
    precinctId: cardlessVoterUser.precinctId,
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: pollWorkerUser,
    cardlessVoterUser,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(1);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.AuthLogin,
    'cardless_voter',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'Cardless voter session started.',
    }
  );

  // Remove poll worker card, granting control to cardless voter
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: cardlessVoterUser,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.AuthLogout,
    'poll_worker',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User logged out.',
    }
  );

  // Insert poll worker card in the middle of cardless voter session
  mockCardStatus({ status: 'ready', user: pollWorkerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: pollWorkerUser,
    cardlessVoterUser,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(3);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.AuthLogin,
    'poll_worker',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User logged in.',
    }
  );

  // Re-remove poll worker card, granting control back to cardless voter
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: cardlessVoterUser,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(4);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.AuthLogout,
    'poll_worker',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'User logged out.',
    }
  );

  // End cardless voter session
  await auth.endCardlessVoterSession();
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(5);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    5,
    LogEventId.AuthLogout,
    'cardless_voter',
    {
      disposition: LogDispositionStandardTypes.Success,
      message: 'Cardless voter session ended.',
    }
  );
});

test('Reading card data', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.readData
    .expectCallWith()
    .resolves(Buffer.from(electionData, 'utf-8'));
  expect(
    await auth.readCardData(machineState, { schema: ElectionSchema })
  ).toEqual(ok(election));

  mockCard.readData
    .expectCallWith()
    .resolves(Buffer.from(electionData, 'utf-8'));
  expect(await auth.readCardDataAsString()).toEqual(ok(electionData));
});

test('Reading card data as string', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.readData.expectCallWith().resolves(Buffer.from([]));
  expect(
    await auth.readCardData(machineState, { schema: ElectionSchema })
  ).toEqual(ok(undefined));

  mockCard.readData.expectCallWith().resolves(Buffer.from([]));
  expect(await auth.readCardDataAsString()).toEqual(ok(undefined));
});

test('Writing card data', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.writeData
    .expectCallWith(Buffer.from(JSON.stringify(election), 'utf-8'))
    .resolves();
  mockCard.readData
    .expectCallWith()
    .resolves(Buffer.from(JSON.stringify(election), 'utf-8'));
  expect(
    await auth.writeCardData(machineState, {
      data: election,
      schema: ElectionSchema,
    })
  ).toEqual(ok());
});

test('Clearing card data', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.clearData.expectCallWith().resolves();
  expect(await auth.clearCardData()).toEqual(ok());
});

test('Checking PIN error handling', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'ready', user: electionManagerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
  });

  mockCard.checkPin.expectCallWith(pin).throws(new Error('Whoa!'));
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    error: true,
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(1);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.AuthPinEntry,
    'election_manager',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'Error checking PIN: Whoa!',
    }
  );

  // Check that "successfully" entering an incorrect PIN clears the error state
  mockCard.checkPin
    .expectCallWith(wrongPin)
    .resolves({ response: 'incorrect', numRemainingAttempts: Infinity });
  await auth.checkPin(machineState, { pin: wrongPin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    wrongPinEnteredAt: expect.any(Date),
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.AuthPinEntry,
    'election_manager',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'User entered incorrect PIN.',
    }
  );

  // Check that wrong PIN entry state is maintained after an error
  mockCard.checkPin.expectCallWith(pin).throws(new Error('Whoa!'));
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    error: true,
    wrongPinEnteredAt: expect.any(Date),
  });
  expect(mockLogger.log).toHaveBeenCalledTimes(3);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.AuthPinEntry,
    'election_manager',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'Error checking PIN: Whoa!',
    }
  );

  mockCard.checkPin.expectCallWith(pin).resolves({ response: 'correct' });
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
  });
});

test(
  'Checking PIN when not in PIN checking state, ' +
    'e.g. because someone removed their card right after entering their PIN',
  async () => {
    const auth = new InsertedSmartCardAuth({
      card: mockCard,
      config: defaultConfig,
      logger: mockLogger,
    });

    mockCardStatus({ status: 'no_card' });
    mockCard.checkPin
      .expectCallWith(pin)
      .throws(new Error('Whoa! Card no longer in reader'));
    await auth.checkPin(machineState, { pin });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_out',
      reason: 'no_card',
    });
    expect(mockLogger.log).toHaveBeenCalledTimes(1);
    expect(mockLogger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.AuthPinEntry,
      'unknown',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'Error checking PIN: Whoa! Card no longer in reader',
      }
    );
  }
);

test('Attempting to start a cardless voter session when logged out', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: { ...defaultConfig, allowCardlessVoterSessions: true },
    logger: mockLogger,
  });

  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });

  await auth.startCardlessVoterSession(machineState, {
    ballotStyleId: cardlessVoterUser.ballotStyleId,
    precinctId: cardlessVoterUser.precinctId,
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'no_card',
  });
});

test('Attempting to start a cardless voter session when not a poll worker', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: { ...defaultConfig, allowCardlessVoterSessions: true },
    logger: mockLogger,
  });

  await logInAsElectionManager(auth);

  await auth.startCardlessVoterSession(machineState, {
    ballotStyleId: cardlessVoterUser.ballotStyleId,
    precinctId: cardlessVoterUser.precinctId,
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
  });
});

test('Attempting to start a cardless voter session when not allowed by config', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  await logInAsPollWorker(auth);

  await expect(
    auth.startCardlessVoterSession(machineState, {
      ballotStyleId: cardlessVoterUser.ballotStyleId,
      precinctId: cardlessVoterUser.precinctId,
    })
  ).rejects.toThrow();
  await expect(auth.endCardlessVoterSession()).rejects.toThrow();
});

test('Reading card data error handling', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.readData.expectCallWith().throws(new Error('Whoa!'));
  expect(
    await auth.readCardData(machineState, { schema: ElectionSchema })
  ).toEqual(err(new Error('Whoa!')));
});

test('Reading card data as string error handling', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.readData
    .expectCallWith()
    .resolves(Buffer.from(JSON.stringify({}), 'utf-8'));
  expect(
    await auth.readCardData(machineState, { schema: ElectionSchema })
  ).toEqual(err(expect.any(z.ZodError)));

  mockCard.readData.expectCallWith().throws(new Error('Whoa!'));
  expect(await auth.readCardDataAsString()).toEqual(err(new Error('Whoa!')));
});

test('Writing card data error handling', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.writeData
    .expectCallWith(Buffer.from(JSON.stringify(election), 'utf-8'))
    .throws(new Error('Whoa!'));
  expect(
    await auth.writeCardData(machineState, {
      data: election,
      schema: ElectionSchema,
    })
  ).toEqual(err(new Error('Whoa!')));

  mockCard.writeData
    .expectCallWith(Buffer.from(JSON.stringify(election), 'utf-8'))
    .resolves();
  mockCard.readData.expectCallWith().throws(new Error('Whoa!'));
  expect(
    await auth.writeCardData(machineState, {
      data: election,
      schema: ElectionSchema,
    })
  ).toEqual(err(new Error('Verification of write by reading data failed')));
});

test('Clearing card data error handling', async () => {
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCard.clearData.expectCallWith().throws(new Error('Whoa!'));
  expect(await auth.clearCardData()).toEqual(err(new Error('Whoa!')));
});

test.each<{ description: string; user: UserWithCard }>([
  {
    description: 'system administrator',
    user: systemAdministratorUser,
  },
  {
    description: 'election manager',
    user: electionManagerUser,
  },
])('SKIP_PIN_ENTRY feature flag - $description', async ({ user }) => {
  mockOf(isFeatureFlagEnabled).mockImplementation(
    (flag) => flag === BooleanEnvironmentVariableName.SKIP_PIN_ENTRY
  );
  const auth = new InsertedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'ready', user });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user,
  });
});
