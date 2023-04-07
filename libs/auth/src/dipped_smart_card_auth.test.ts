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
import { DippedSmartCardAuth as DippedSmartCardAuthTypes } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  generatePin,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { buildMockCard, MockCard, mockCardAssertComplete } from '../test/utils';
import { Card, CardDetails, CardStatus } from './card';
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
let mockTime: Date;

beforeEach(() => {
  mockTime = new Date();
  jest.useFakeTimers();
  jest.setSystemTime(mockTime);

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

const jurisdiction = 'st.jurisdiction';
const otherJurisdiction = 'st.other-jurisdiction';
const { electionData, electionHash } = electionSampleDefinition;
const otherElectionHash = electionSample2Definition.electionHash;
const defaultConfig: DippedSmartCardAuthConfig = {};
const defaultMachineState: DippedSmartCardAuthMachineState = {
  electionHash,
  jurisdiction,
};
const systemAdministratorUser = fakeSystemAdministratorUser();
const electionManagerUser = fakeElectionManagerUser({ electionHash });
const pollWorkerUser = fakePollWorkerUser({ electionHash });

function mockCardStatus(cardStatus: CardStatus) {
  mockCard.getCardStatus.expectRepeatedCallsWith().resolves(cardStatus);
}

async function logInAsSystemAdministrator(
  auth: DippedSmartCardAuth,
  machineState: DippedSmartCardAuthMachineState = defaultMachineState
) {
  mockCardStatus({
    status: 'ready',
    cardDetails: {
      jurisdiction,
      user: systemAdministratorUser,
    },
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: systemAdministratorUser,
  });
  mockCard.checkPin.expectCallWith(pin).resolves({ response: 'correct' });
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'remove_card',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Number),
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Number),
    programmableCard: { status: 'no_card' },
  });
  mockOf(mockLogger.log).mockClear();
}

async function logInAsElectionManager(
  auth: DippedSmartCardAuth,
  machineState: DippedSmartCardAuthMachineState = defaultMachineState
) {
  mockCardStatus({
    status: 'ready',
    cardDetails: {
      jurisdiction,
      user: electionManagerUser,
    },
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
  });
  mockCard.checkPin.expectCallWith(pin).resolves({ response: 'correct' });
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'remove_card',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Number),
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Number),
  });
  mockOf(mockLogger.log).mockClear();
}

test.each<{
  description: string;
  cardStatus: CardStatus;
  expectedAuthStatus: DippedSmartCardAuthTypes.AuthStatus;
  expectedLogOnInsertion?: Parameters<Logger['log']>;
  expectedLogOnRemoval?: Parameters<Logger['log']>;
}>([
  {
    description: 'unknown error',
    cardStatus: { status: 'unknown_error' },
    expectedAuthStatus: { status: 'logged_out', reason: 'machine_locked' },
  },
  {
    description: 'card error',
    cardStatus: { status: 'card_error' },
    expectedAuthStatus: { status: 'logged_out', reason: 'card_error' },
    expectedLogOnInsertion: [
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
    description: 'canceling PIN entry',
    cardStatus: {
      status: 'ready',
      cardDetails: {
        jurisdiction,
        user: systemAdministratorUser,
      },
    },
    expectedAuthStatus: {
      status: 'checking_pin',
      user: systemAdministratorUser,
    },
    expectedLogOnRemoval: [
      LogEventId.AuthPinEntry,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User canceled PIN entry.',
      },
    ],
  },
])(
  'Card insertions and removals - $description',
  async ({
    cardStatus,
    expectedAuthStatus,
    expectedLogOnInsertion,
    expectedLogOnRemoval,
  }) => {
    const auth = new DippedSmartCardAuth({
      card: mockCard,
      config: defaultConfig,
      logger: mockLogger,
    });

    mockCardStatus({ status: 'no_card' });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'logged_out',
      reason: 'machine_locked',
    });

    mockCardStatus(cardStatus);
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual(
      expectedAuthStatus
    );
    if (expectedLogOnInsertion) {
      expect(mockLogger.log).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenNthCalledWith(
        1,
        ...expectedLogOnInsertion
      );
    }

    mockCardStatus({ status: 'no_card' });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'logged_out',
      reason: 'machine_locked',
    });
    if (expectedLogOnRemoval) {
      const logIndex = expectedLogOnInsertion ? 2 : 1;
      expect(mockLogger.log).toHaveBeenCalledTimes(logIndex);
      expect(mockLogger.log).toHaveBeenNthCalledWith(
        logIndex,
        ...expectedLogOnRemoval
      );
    }
  }
);

test.each<{
  description: string;
  cardDetails: CardDetails;
  expectedLoggedInAuthStatus: DippedSmartCardAuthTypes.LoggedIn;
}>([
  {
    description: 'system administrator',
    cardDetails: {
      jurisdiction,
      user: systemAdministratorUser,
    },
    expectedLoggedInAuthStatus: {
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Number),
      programmableCard: { status: 'no_card' },
    },
  },
  {
    description: 'election manager',
    cardDetails: {
      jurisdiction,
      user: electionManagerUser,
    },
    expectedLoggedInAuthStatus: {
      status: 'logged_in',
      user: electionManagerUser,
      sessionExpiresAt: expect.any(Number),
    },
  },
])(
  'Login and logout - $description',
  async ({ cardDetails, expectedLoggedInAuthStatus }) => {
    const auth = new DippedSmartCardAuth({
      card: mockCard,
      config: defaultConfig,
      logger: mockLogger,
    });
    const { user } = cardDetails;

    mockCardStatus({ status: 'ready', cardDetails });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'checking_pin',
      user,
    });

    mockCard.checkPin
      .expectCallWith(wrongPin)
      .resolves({ response: 'incorrect', numIncorrectPinAttempts: 1 });
    await auth.checkPin(defaultMachineState, { pin: wrongPin });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'checking_pin',
      user,
      wrongPinEnteredAt: expect.any(Number),
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
    await auth.checkPin(defaultMachineState, { pin });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'remove_card',
      user,
      sessionExpiresAt: expect.any(Number),
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
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual(
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

    await auth.logOut(defaultMachineState);
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
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

test('Card lockout', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });
  const machineState: DippedSmartCardAuthMachineState = {
    ...defaultMachineState,
    // Intentionally pick non-default values to verify that machine state is being properly used
    numIncorrectPinAttemptsAllowedBeforeCardLockout: 3,
    startingCardLockoutDurationSeconds: 30,
  };

  mockCardStatus({
    status: 'ready',
    cardDetails: {
      jurisdiction,
      numIncorrectPinAttempts: 2,
      user: electionManagerUser,
    },
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
  });

  mockCard.checkPin
    .expectCallWith(wrongPin)
    .resolves({ response: 'incorrect', numIncorrectPinAttempts: 3 });
  await auth.checkPin(machineState, { pin: wrongPin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    lockedOutUntil: mockTime.getTime() + 30 * 1000,
    wrongPinEnteredAt: mockTime.getTime(),
  });

  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  mockTime = new Date(mockTime.getTime() + 5000);
  jest.setSystemTime(mockTime);

  // Expect timer to reset when locked card is re-inserted
  mockCardStatus({
    status: 'ready',
    cardDetails: {
      jurisdiction,
      numIncorrectPinAttempts: 3,
      user: electionManagerUser,
    },
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    lockedOutUntil: mockTime.getTime() + 30 * 1000,
  });

  // Expect checkPin call to be ignored when locked out
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    lockedOutUntil: mockTime.getTime() + 30 * 1000,
  });

  mockTime = new Date(mockTime.getTime() + 30 * 1000);
  jest.setSystemTime(mockTime);

  // Expect checkPin call to go through after lockout ends and lockout time to double with
  // subsequent incorrect PIN attempts
  mockCard.checkPin
    .expectCallWith(wrongPin)
    .resolves({ response: 'incorrect', numIncorrectPinAttempts: 4 });
  await auth.checkPin(machineState, { pin: wrongPin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    lockedOutUntil: mockTime.getTime() + 60 * 1000,
    wrongPinEnteredAt: mockTime.getTime(),
  });
});

test('Session expiry', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });
  const machineState: DippedSmartCardAuthMachineState = {
    ...defaultMachineState,
    // Intentionally pick non-default value to verify that machine state is being properly used
    overallSessionTimeLimitHours: 2,
  };

  await logInAsElectionManager(auth, machineState);

  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: mockTime.getTime() + 2 * 60 * 60 * 1000,
  });

  mockTime = new Date(mockTime.getTime() + 2 * 60 * 60 * 1000);
  jest.setSystemTime(mockTime);

  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });
});

test('Updating session expiry', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  await logInAsElectionManager(auth, defaultMachineState);

  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: mockTime.getTime() + 12 * 60 * 60 * 1000,
  });

  await auth.updateSessionExpiry(defaultMachineState, {
    sessionExpiresAt: mockTime.getTime() + 60 * 1000,
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: mockTime.getTime() + 60 * 1000,
  });
});

test.each<{
  description: string;
  config: DippedSmartCardAuthConfig;
  machineState: DippedSmartCardAuthMachineState;
  cardDetails?: CardDetails;
  expectedAuthStatus: DippedSmartCardAuthTypes.AuthStatus;
  expectedLog?: Parameters<Logger['log']>;
}>([
  {
    description: 'invalid user on card',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: undefined,
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
    description: 'wrong jurisdiction',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      jurisdiction: otherJurisdiction,
      user: systemAdministratorUser,
    },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'invalid_user_on_card',
      cardUserRole: 'system_administrator',
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'invalid_user_on_card',
      },
    ],
  },
  {
    description: 'skips jurisdiction validation if no machine jurisdiction',
    config: defaultConfig,
    machineState: { ...defaultMachineState, jurisdiction: undefined },
    cardDetails: {
      jurisdiction,
      user: systemAdministratorUser,
    },
    expectedAuthStatus: {
      status: 'checking_pin',
      user: systemAdministratorUser,
    },
  },
  {
    description: 'user role not allowed',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      jurisdiction,
      user: pollWorkerUser,
      hasPin: false,
    },
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
    description: 'unconfigured machine',
    config: defaultConfig,
    machineState: { ...defaultMachineState, electionHash: undefined },
    cardDetails: {
      jurisdiction,
      user: electionManagerUser,
    },
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
    description:
      'unconfigured machine, allowElectionManagersToAccessUnconfiguredMachines = true',
    config: {
      ...defaultConfig,
      allowElectionManagersToAccessUnconfiguredMachines: true,
    },
    machineState: { ...defaultMachineState, electionHash: undefined },
    cardDetails: {
      jurisdiction,
      user: electionManagerUser,
    },
    expectedAuthStatus: {
      status: 'checking_pin',
      user: electionManagerUser,
    },
  },
  {
    description: 'mismatched election hash',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      jurisdiction,
      user: { ...electionManagerUser, electionHash: otherElectionHash },
    },
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
])(
  'Card validation - $description',
  async ({
    config,
    machineState,
    cardDetails,
    expectedAuthStatus,
    expectedLog,
  }) => {
    const auth = new DippedSmartCardAuth({
      card: mockCard,
      config,
      logger: mockLogger,
    });

    mockCardStatus({ status: 'ready', cardDetails });
    expect(await auth.getAuthStatus(machineState)).toEqual(expectedAuthStatus);
    if (expectedLog) {
      expect(mockLogger.log).toHaveBeenCalledTimes(1);
      expect(mockLogger.log).toHaveBeenNthCalledWith(1, ...expectedLog);
    }
  }
);

test.each<{
  description: string;
  machineState: DippedSmartCardAuthMachineState;
  input: Parameters<DippedSmartCardAuth['programCard']>[1];
  expectedCardProgramInput: Parameters<Card['program']>[0];
  expectedProgramResult: Awaited<
    ReturnType<DippedSmartCardAuth['programCard']>
  >;
  cardDetailsAfterProgramming: CardDetails;
}>([
  {
    description: 'system administrator cards',
    machineState: defaultMachineState,
    input: { userRole: 'system_administrator' },
    expectedCardProgramInput: {
      user: { role: 'system_administrator' },
      pin,
    },
    expectedProgramResult: ok({ pin }),
    cardDetailsAfterProgramming: {
      jurisdiction,
      user: { role: 'system_administrator' },
    },
  },
  {
    description: 'election manager cards',
    machineState: defaultMachineState,
    input: { userRole: 'election_manager', electionData },
    expectedCardProgramInput: {
      user: { role: 'election_manager', electionHash },
      pin,
      electionData,
    },
    expectedProgramResult: ok({ pin }),
    cardDetailsAfterProgramming: {
      jurisdiction,
      user: { role: 'election_manager', electionHash },
    },
  },
  {
    description: 'poll worker cards',
    machineState: defaultMachineState,
    input: { userRole: 'poll_worker' },
    expectedCardProgramInput: {
      user: { role: 'poll_worker', electionHash },
    },
    expectedProgramResult: ok({ pin: undefined }),
    cardDetailsAfterProgramming: {
      jurisdiction,
      user: { role: 'poll_worker', electionHash },
      hasPin: false,
    },
  },
  {
    description: 'poll worker cards with PINs',
    machineState: {
      ...defaultMachineState,
      arePollWorkerCardPinsEnabled: true,
    },
    input: { userRole: 'poll_worker' },
    expectedCardProgramInput: {
      user: { role: 'poll_worker', electionHash },
      pin,
    },
    expectedProgramResult: ok({ pin }),
    cardDetailsAfterProgramming: {
      jurisdiction,
      user: { role: 'poll_worker', electionHash },
      hasPin: true,
    },
  },
])(
  'Card programming and unprogramming - $description',
  async ({
    machineState,
    input,
    expectedCardProgramInput,
    expectedProgramResult,
    cardDetailsAfterProgramming,
  }) => {
    const auth = new DippedSmartCardAuth({
      card: mockCard,
      config: defaultConfig,
      logger: mockLogger,
    });

    await logInAsSystemAdministrator(auth);

    mockCardStatus({ status: 'ready', cardDetails: undefined });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Number),
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
    mockCardStatus({
      status: 'ready',
      cardDetails: cardDetailsAfterProgramming,
    });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Number),
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

    mockCardStatus({ status: 'ready', cardDetails: undefined });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Number),
      programmableCard: { status: 'ready', programmedUser: undefined },
    });
  }
);

test.each<{
  description: string;
  machineState: DippedSmartCardAuthMachineState;
  cardDetails: CardDetails;
}>([
  {
    description: 'treating card from another jurisdiction as unprogrammed',
    machineState: defaultMachineState,
    cardDetails: {
      jurisdiction: otherJurisdiction,
      user: electionManagerUser,
    },
  },
  {
    description:
      'treating poll worker card without a PIN as unprogrammed if poll worker card PINs are enabled',
    machineState: {
      ...defaultMachineState,
      arePollWorkerCardPinsEnabled: true,
    },
    cardDetails: {
      jurisdiction: otherJurisdiction,
      user: pollWorkerUser,
      hasPin: false,
    },
  },
  {
    description:
      'treating poll worker card with a PIN as unprogrammed if poll worker card PINs are not enabled',
    machineState: defaultMachineState,
    cardDetails: {
      jurisdiction: otherJurisdiction,
      user: pollWorkerUser,
      hasPin: true,
    },
  },
])(
  'Card programming edge cases - $description',
  async ({ machineState, cardDetails }) => {
    const auth = new DippedSmartCardAuth({
      card: mockCard,
      config: defaultConfig,
      logger: mockLogger,
    });

    await logInAsSystemAdministrator(auth);

    mockCardStatus({ status: 'ready', cardDetails });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Number),
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

  mockCardStatus({
    status: 'ready',
    cardDetails: {
      jurisdiction,
      user: electionManagerUser,
    },
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
  });

  mockCard.checkPin.expectCallWith(pin).throws(new Error('Whoa!'));
  await auth.checkPin(defaultMachineState, { pin });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
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
    .resolves({ response: 'incorrect', numIncorrectPinAttempts: 1 });
  await auth.checkPin(defaultMachineState, { pin: wrongPin });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    wrongPinEnteredAt: expect.any(Number),
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
  await auth.checkPin(defaultMachineState, { pin });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    error: true,
    wrongPinEnteredAt: expect.any(Number),
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
  await auth.checkPin(defaultMachineState, { pin });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'remove_card',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Number),
  });
});

test(
  'Attempting to check a PIN when not in PIN checking state, ' +
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
    await auth.checkPin(defaultMachineState, { pin });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
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

test('Attempting to update session expiry when not logged in', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  await auth.updateSessionExpiry(defaultMachineState, {
    sessionExpiresAt: new Date().getTime(),
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });
});

test('Card programming error handling', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  await logInAsSystemAdministrator(auth);

  mockCardStatus({ status: 'card_error' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Number),
    programmableCard: { status: 'card_error' },
  });

  mockCardStatus({ status: 'unknown_error' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Number),
    programmableCard: { status: 'unknown_error' },
  });

  mockCardStatus({ status: 'ready', cardDetails: undefined });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Number),
    programmableCard: { status: 'ready', programmedUser: undefined },
  });

  mockCard.program
    .expectCallWith({
      user: { role: 'poll_worker', electionHash },
    })
    .throws(new Error('Whoa!'));
  expect(
    await auth.programCard(defaultMachineState, { userRole: 'poll_worker' })
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

  mockCardStatus({
    status: 'ready',
    cardDetails: {
      jurisdiction,
      user: pollWorkerUser,
      hasPin: false,
    },
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Number),
    programmableCard: { status: 'ready', programmedUser: pollWorkerUser },
  });

  mockCard.unprogram.expectCallWith().throws(new Error('Whoa!'));
  expect(await auth.unprogramCard(defaultMachineState)).toEqual(
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
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  expect(
    await auth.programCard(defaultMachineState, { userRole: 'poll_worker' })
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

  expect(await auth.unprogramCard(defaultMachineState)).toEqual(
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
    await auth.programCard(defaultMachineState, { userRole: 'poll_worker' })
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

  expect(await auth.unprogramCard(defaultMachineState)).toEqual(
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

  mockCardStatus({
    status: 'ready',
    cardDetails: {
      jurisdiction,
      user: electionManagerUser,
    },
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'remove_card',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Number),
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Number),
  });
});
