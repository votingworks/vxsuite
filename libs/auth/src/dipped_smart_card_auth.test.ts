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
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import {
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
  UserWithCard,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  generatePin,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { buildMockCard, MockCard, mockCardAssertComplete } from '../test/utils';
import { Card, CardStatus } from './card';
import { DippedSmartCardAuth } from './dipped_smart_card_auth';
import {
  DippedSmartCardAuthConfig,
  DippedSmartCardAuthMachineState,
} from './dipped_smart_card_auth_api';

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

const { electionData, electionHash } = electionSampleDefinition;
const otherElectionHash = electionSample2Definition.electionHash;
const defaultConfig: DippedSmartCardAuthConfig = {};
const machineState: DippedSmartCardAuthMachineState = { electionHash };
const systemAdministratorUser = fakeSystemAdministratorUser();
const electionManagerUser = fakeElectionManagerUser({ electionHash });
const pollWorkerUser = fakePollWorkerUser({ electionHash });

function mockCardStatus(cardStatus: CardStatus) {
  mockCard.getCardStatus.expectRepeatedCallsWith().resolves(cardStatus);
}

async function logInAsSystemAdministrator(auth: DippedSmartCardAuth) {
  mockCardStatus({ status: 'ready', user: systemAdministratorUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: systemAdministratorUser,
  });
  mockCard.checkPin.expectCallWith(pin).resolves({ response: 'correct' });
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'remove_card',
    user: systemAdministratorUser,
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    programmableCard: { status: 'no_card' },
  });
  mockOf(mockLogger.log).mockClear();
}

async function logInAsElectionManager(auth: DippedSmartCardAuth) {
  mockCardStatus({ status: 'ready', user: electionManagerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
  });
  mockCard.checkPin.expectCallWith(pin).resolves({ response: 'correct' });
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'remove_card',
    user: electionManagerUser,
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
  });
  mockOf(mockLogger.log).mockClear();
}

test('Card insertions and removals', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  const testSequence: Array<{
    cardStatus: CardStatus;
    expectedAuthStatus: DippedSmartCardAuthTypes.AuthStatus;
    expectedLog?: Parameters<Logger['log']>;
  }> = [
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
    },
    {
      cardStatus: { status: 'unknown_error' },
      expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
    },
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
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
      expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
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
      expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
    },
    {
      cardStatus: { status: 'ready', user: pollWorkerUser },
      expectedAuthStatus: {
        status: 'logged_out',
        reason: 'user_role_not_allowed',
        cardUserRole: 'poll_worker',
      },
      expectedLog: [
        LogEventId.AuthLogin,
        'poll_worker',
        {
          disposition: LogDispositionStandardTypes.Failure,
          message: 'User failed login.',
          reason: 'user_role_not_allowed',
        },
      ],
    },
    {
      cardStatus: { status: 'no_card' },
      expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
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
      expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
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
  expect(mockLogger.log).toHaveBeenCalledTimes(4);
});

test.each<{
  description: string;
  user: UserWithCard;
  expectedLoggedInAuthStatus: DippedSmartCardAuthTypes.LoggedIn;
}>([
  {
    description: 'system administrator',
    user: systemAdministratorUser,
    expectedLoggedInAuthStatus: {
      status: 'logged_in',
      user: systemAdministratorUser,
      programmableCard: { status: 'no_card' },
    },
  },
  {
    description: 'election manager',
    user: electionManagerUser,
    expectedLoggedInAuthStatus: {
      status: 'logged_in',
      user: electionManagerUser,
    },
  },
])(
  'Login and logout - $description',
  async ({ user, expectedLoggedInAuthStatus }) => {
    const auth = new DippedSmartCardAuth({
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
      status: 'remove_card',
      user,
    });
    expect(mockLogger.log).toHaveBeenCalledTimes(2);
    expect(mockLogger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.AuthPinEntry,
      user.role,
      {
        disposition: LogDispositionStandardTypes.Success,
        message: 'User entered correct PIN.',
      }
    );

    mockCardStatus({ status: 'no_card' });
    expect(await auth.getAuthStatus(machineState)).toEqual(
      expectedLoggedInAuthStatus
    );
    expect(mockLogger.log).toHaveBeenCalledTimes(3);
    expect(mockLogger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.AuthLogin,
      user.role,
      {
        disposition: LogDispositionStandardTypes.Success,
        message: 'User logged in.',
      }
    );

    await auth.logOut(machineState);
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_out',
      reason: 'machine_locked',
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
  }
);

test.each<{
  description: string;
  config: DippedSmartCardAuthConfig;
  machineElectionHash?: string;
  expectedAuthStatus: DippedSmartCardAuthTypes.AuthStatus;
  expectedLog?: Parameters<Logger['log']>;
}>([
  {
    description: 'unconfigured machine',
    config: defaultConfig,
    machineElectionHash: undefined,
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'machine_not_configured',
      cardUserRole: 'election_manager',
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'election_manager',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'machine_not_configured',
      },
    ],
  },
  {
    description: 'mismatched election hash',
    config: defaultConfig,
    machineElectionHash: otherElectionHash,
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
    description:
      'unconfigured machine, allowElectionManagersToAccessUnconfiguredMachines = true',
    config: {
      ...defaultConfig,
      allowElectionManagersToAccessUnconfiguredMachines: true,
    },
    machineElectionHash: undefined,
    expectedAuthStatus: {
      status: 'checking_pin',
      user: electionManagerUser,
    },
  },
])(
  'Election checks - $description',
  async ({ config, machineElectionHash, expectedAuthStatus, expectedLog }) => {
    const auth = new DippedSmartCardAuth({
      card: mockCard,
      config,
      logger: mockLogger,
    });

    mockCardStatus({ status: 'ready', user: electionManagerUser });
    expect(
      await auth.getAuthStatus({ electionHash: machineElectionHash })
    ).toEqual(expectedAuthStatus);
    if (expectedLog) {
      expect(mockLogger.log).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenNthCalledWith(1, ...expectedLog);
    }
  }
);

test.each<{
  description: string;
  input: Parameters<DippedSmartCardAuth['programCard']>[1];
  expectedCardProgramInput: Parameters<Card['program']>[0];
  expectedProgramResult: Awaited<
    ReturnType<DippedSmartCardAuth['programCard']>
  >;
}>([
  {
    description: 'system administrator cards',
    input: { userRole: 'system_administrator' },
    expectedCardProgramInput: {
      user: { role: 'system_administrator' },
      pin,
    },
    expectedProgramResult: ok({ pin }),
  },
  {
    description: 'election manager cards',
    input: { userRole: 'election_manager', electionData },
    expectedCardProgramInput: {
      user: { role: 'election_manager', electionHash },
      pin,
      electionData,
    },
    expectedProgramResult: ok({ pin }),
  },
  {
    description: 'poll worker cards',
    input: { userRole: 'poll_worker' },
    expectedCardProgramInput: {
      user: { role: 'poll_worker', electionHash },
    },
    expectedProgramResult: ok({}),
  },
])(
  'Card programming and unprogramming - $description',
  async ({ input, expectedCardProgramInput, expectedProgramResult }) => {
    const auth = new DippedSmartCardAuth({
      card: mockCard,
      config: defaultConfig,
      logger: mockLogger,
    });

    await logInAsSystemAdministrator(auth);

    mockCardStatus({ status: 'ready', user: undefined });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      programmableCard: { status: 'ready', programmedUser: undefined },
    });

    mockCard.program.expectCallWith(expectedCardProgramInput).resolves();
    expect(await auth.programCard(machineState, input)).toEqual(
      expectedProgramResult
    );
    expect(mockLogger.log).toHaveBeenCalledTimes(2);
    expect(mockLogger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.SmartCardProgramInit,
      'system_administrator',
      {
        message: 'Programming smart card...',
        programmedUserRole: input.userRole,
      }
    );
    expect(mockLogger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.SmartCardProgramComplete,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Success,
        message: 'Successfully programmed smart card.',
        programmedUserRole: input.userRole,
      }
    );

    const programmedUser = expectedCardProgramInput.user;
    mockCardStatus({ status: 'ready', user: programmedUser });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      programmableCard: { status: 'ready', programmedUser },
    });

    mockCard.unprogram.expectCallWith().resolves();
    expect(await auth.unprogramCard(machineState)).toEqual(ok());
    expect(mockLogger.log).toHaveBeenCalledTimes(4);
    expect(mockLogger.log).toHaveBeenNthCalledWith(
      3,
      LogEventId.SmartCardUnprogramInit,
      'system_administrator',
      {
        message: 'Unprogramming smart card...',
        programmedUserRole: input.userRole,
      }
    );
    expect(mockLogger.log).toHaveBeenNthCalledWith(
      4,
      LogEventId.SmartCardUnprogramComplete,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Success,
        message: 'Successfully unprogrammed smart card.',
        previousProgrammedUserRole: input.userRole,
      }
    );

    mockCardStatus({ status: 'ready', user: undefined });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      programmableCard: { status: 'ready', programmedUser: undefined },
    });
  }
);

test('Checking PIN error handling', async () => {
  const auth = new DippedSmartCardAuth({
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
    status: 'remove_card',
    user: electionManagerUser,
  });
});

test(
  'Checking PIN when not in PIN checking state, ' +
    'e.g. because someone removed their card right after entering their PIN',
  async () => {
    const auth = new DippedSmartCardAuth({
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
      reason: 'machine_locked',
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

test('Card programming error handling', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  await logInAsSystemAdministrator(auth);

  mockCardStatus({ status: 'card_error' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    programmableCard: { status: 'card_error' },
  });

  mockCardStatus({ status: 'unknown_error' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    programmableCard: { status: 'unknown_error' },
  });

  mockCardStatus({ status: 'ready', user: undefined });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    programmableCard: { status: 'ready', programmedUser: undefined },
  });

  mockCard.program
    .expectCallWith({ user: { role: 'poll_worker', electionHash } })
    .throws(new Error('Whoa!'));
  expect(
    await auth.programCard(machineState, { userRole: 'poll_worker' })
  ).toEqual(err(new Error('Error programming card')));
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.SmartCardProgramInit,
    'system_administrator',
    {
      message: 'Programming smart card...',
      programmedUserRole: 'poll_worker',
    }
  );
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.SmartCardProgramComplete,
    'system_administrator',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'Error programming smart card: Whoa!',
      programmedUserRole: 'poll_worker',
    }
  );
});

test('Card unprogramming error handling', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  await logInAsSystemAdministrator(auth);

  mockCardStatus({ status: 'ready', user: pollWorkerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    programmableCard: { status: 'ready', programmedUser: pollWorkerUser },
  });

  mockCard.unprogram.expectCallWith().throws(new Error('Whoa!'));
  expect(await auth.unprogramCard(machineState)).toEqual(
    err(new Error('Error unprogramming card'))
  );
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.SmartCardUnprogramInit,
    'system_administrator',
    {
      message: 'Unprogramming smart card...',
      programmedUserRole: 'poll_worker',
    }
  );
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.SmartCardUnprogramComplete,
    'system_administrator',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'Error unprogramming smart card: Whoa!',
      programmedUserRole: 'poll_worker',
    }
  );
});

test('Attempting card programming and unprogramming when logged out', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  expect(
    await auth.programCard(machineState, { userRole: 'poll_worker' })
  ).toEqual(err(new Error('Error programming card')));
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.SmartCardProgramInit,
    'system_administrator',
    {
      message: 'Programming smart card...',
      programmedUserRole: 'poll_worker',
    }
  );
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.SmartCardProgramComplete,
    'system_administrator',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'Error programming smart card: User is not logged in',
      programmedUserRole: 'poll_worker',
    }
  );

  expect(await auth.unprogramCard(machineState)).toEqual(
    err(new Error('Error unprogramming card'))
  );
  expect(mockLogger.log).toHaveBeenCalledTimes(4);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.SmartCardUnprogramInit,
    'system_administrator',
    {
      message: 'Unprogramming smart card...',
      programmedUserRole: 'unprogrammed',
    }
  );
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.SmartCardUnprogramComplete,
    'system_administrator',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message: 'Error unprogramming smart card: User is not logged in',
      programmedUserRole: 'unprogrammed',
    }
  );
});

test('Attempting card programming and unprogramming when not a system administrator', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  await logInAsElectionManager(auth);

  expect(
    await auth.programCard(machineState, { userRole: 'poll_worker' })
  ).toEqual(err(new Error('Error programming card')));
  expect(mockLogger.log).toHaveBeenCalledTimes(2);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.SmartCardProgramInit,
    'system_administrator',
    {
      message: 'Programming smart card...',
      programmedUserRole: 'poll_worker',
    }
  );
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.SmartCardProgramComplete,
    'system_administrator',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message:
        'Error programming smart card: User is not a system administrator',
      programmedUserRole: 'poll_worker',
    }
  );

  expect(await auth.unprogramCard(machineState)).toEqual(
    err(new Error('Error unprogramming card'))
  );
  expect(mockLogger.log).toHaveBeenCalledTimes(4);
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.SmartCardUnprogramInit,
    'system_administrator',
    {
      message: 'Unprogramming smart card...',
      programmedUserRole: 'unprogrammed',
    }
  );
  expect(mockLogger.log).toHaveBeenNthCalledWith(
    4,
    LogEventId.SmartCardUnprogramComplete,
    'system_administrator',
    {
      disposition: LogDispositionStandardTypes.Failure,
      message:
        'Error unprogramming smart card: User is not a system administrator',
      programmedUserRole: 'unprogrammed',
    }
  );
});

test('SKIP_PIN_ENTRY feature flag', async () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(
    (flag) => flag === BooleanEnvironmentVariableName.SKIP_PIN_ENTRY
  );
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'ready', user: electionManagerUser });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'remove_card',
    user: electionManagerUser,
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
  });
});
