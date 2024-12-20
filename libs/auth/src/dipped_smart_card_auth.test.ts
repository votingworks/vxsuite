import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DateTime } from 'luxon';
import { err, ok } from '@votingworks/basics';
import {
  readElectionGeneral,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import {
  mockBaseLogger,
  LogDispositionStandardTypes,
  LogEventId,
  BaseLogger,
  MockBaseLogger,
} from '@votingworks/logging';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSystemAdministratorUser,
  mockOf,
  mockVendorUser,
} from '@votingworks/test-utils';
import {
  DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
  DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
  constructElectionKey,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  generatePin,
  getFeatureFlagMock,
} from '@votingworks/utils';

import { buildMockCard, MockCard, mockCardAssertComplete } from '../test/utils';
import {
  CardDetails,
  CardStatus,
  ProgrammableCard,
  ProgrammedCardDetails,
} from './card';
import { DippedSmartCardAuth } from './dipped_smart_card_auth';
import {
  DippedSmartCardAuthConfig,
  DippedSmartCardAuthMachineState,
} from './dipped_smart_card_auth_api';
import { UNIVERSAL_VENDOR_CARD_JURISDICTION } from './jurisdictions';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(
  '@votingworks/utils',
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual<typeof import('@votingworks/utils')>()),
    generatePin: vi.fn(),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  })
);

const pin = '123456';
const wrongPin = '654321';

let mockCard: MockCard;
let mockLogger: MockBaseLogger<typeof vi.fn>;
let mockTime: DateTime;

beforeEach(() => {
  mockTime = DateTime.now();
  vi.useFakeTimers();
  vi.setSystemTime(mockTime.toJSDate());

  mockOf(generatePin).mockImplementation(() => pin);
  mockFeatureFlagger.resetFeatureFlags();

  mockCard = buildMockCard();
  mockLogger = mockBaseLogger({ fn: vi.fn });
});

afterEach(() => {
  mockCardAssertComplete(mockCard);
});

const jurisdiction = TEST_JURISDICTION;
const otherJurisdiction = `${TEST_JURISDICTION}-2`;
const electionKey = constructElectionKey(readElectionGeneral());
const otherElectionKey = constructElectionKey(readElectionTwoPartyPrimary());
const defaultConfig: DippedSmartCardAuthConfig = {};
const defaultMachineState: DippedSmartCardAuthMachineState = {
  electionKey,
  jurisdiction,
  arePollWorkerCardPinsEnabled: false,
  numIncorrectPinAttemptsAllowedBeforeCardLockout:
    DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT,
  startingCardLockoutDurationSeconds:
    DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS,
  overallSessionTimeLimitHours: DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
};
const vendorUser = mockVendorUser({ jurisdiction });
const systemAdministratorUser = mockSystemAdministratorUser({ jurisdiction });
const electionManagerUser = mockElectionManagerUser({
  jurisdiction,
  electionKey,
});
const pollWorkerUser = mockPollWorkerUser({ jurisdiction, electionKey });

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
    sessionExpiresAt: expect.any(Date),
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Date),
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
    sessionExpiresAt: expect.any(Date),
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Date),
  });
  mockOf(mockLogger.log).mockClear();
}

test('No card reader', async () => {
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({ status: 'no_card_reader' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
});

test.each<{
  description: string;
  cardStatus: CardStatus;
  expectedAuthStatus: DippedSmartCardAuthTypes.AuthStatus;
  expectedLogOnInsertion?: Parameters<BaseLogger['log']>;
  expectedLogOnRemoval?: Parameters<BaseLogger['log']>;
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
  cardDetails: ProgrammedCardDetails;
  expectedLoggedInAuthStatus: DippedSmartCardAuthTypes.LoggedIn;
}>([
  {
    description: 'vendor',
    cardDetails: {
      user: vendorUser,
    },
    expectedLoggedInAuthStatus: {
      status: 'logged_in',
      user: vendorUser,
      sessionExpiresAt: expect.any(Date),
    },
  },
  {
    description: 'system administrator',
    cardDetails: {
      user: systemAdministratorUser,
    },
    expectedLoggedInAuthStatus: {
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Date),
      programmableCard: { status: 'no_card' },
    },
  },
  {
    description: 'election manager',
    cardDetails: {
      user: electionManagerUser,
    },
    expectedLoggedInAuthStatus: {
      status: 'logged_in',
      user: electionManagerUser,
      sessionExpiresAt: expect.any(Date),
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
    await auth.checkPin(defaultMachineState, { pin });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'remove_card',
      user,
      sessionExpiresAt: expect.any(Date),
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
        reason: 'machine_locked',
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
      user: electionManagerUser,
      numIncorrectPinAttempts: 2,
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
    lockedOutUntil: mockTime.plus({ seconds: 30 }).toJSDate(),
    wrongPinEnteredAt: mockTime.toJSDate(),
  });

  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  mockTime = mockTime.plus({ seconds: 5 });
  vi.setSystemTime(mockTime.toJSDate());

  // Expect timer to reset when locked card is re-inserted
  mockCardStatus({
    status: 'ready',
    cardDetails: {
      user: electionManagerUser,
      numIncorrectPinAttempts: 3,
    },
  });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    lockedOutUntil: mockTime.plus({ seconds: 30 }).toJSDate(),
  });
  expect(mockLogger.log).toHaveBeenCalledWith(
    LogEventId.AuthPinEntryLockout,
    expect.anything(),
    expect.anything()
  );

  // Expect checkPin call to be ignored when locked out
  await auth.checkPin(machineState, { pin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    lockedOutUntil: mockTime.plus({ seconds: 30 }).toJSDate(),
  });

  mockTime = mockTime.plus({ seconds: 30 });
  vi.setSystemTime(mockTime.toJSDate());

  // Expect checkPin call to go through after lockout ends and lockout time to double with
  // subsequent incorrect PIN attempts
  mockCard.checkPin
    .expectCallWith(wrongPin)
    .resolves({ response: 'incorrect', numIncorrectPinAttempts: 4 });
  await auth.checkPin(machineState, { pin: wrongPin });
  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    lockedOutUntil: mockTime.plus({ seconds: 60 }).toJSDate(),
    wrongPinEnteredAt: mockTime.toJSDate(),
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
    sessionExpiresAt: mockTime.plus({ hours: 2 }).toJSDate(),
  });

  mockTime = mockTime.plus({ hours: 2 });
  vi.setSystemTime(mockTime.toJSDate());

  expect(await auth.getAuthStatus(machineState)).toEqual({
    status: 'logged_out',
    reason: 'machine_locked_by_session_expiry',
  });
  expect(mockLogger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogout,
    'election_manager',
    expect.objectContaining({
      message: 'User logged out automatically due to session expiry.',
      reason: 'machine_locked_by_session_expiry',
    })
  );
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
    sessionExpiresAt: mockTime.plus({ hours: 12 }).toJSDate(),
  });

  await auth.updateSessionExpiry(defaultMachineState, {
    sessionExpiresAt: mockTime.plus({ seconds: 60 }).toJSDate(),
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: mockTime.plus({ seconds: 60 }).toJSDate(),
  });
});

test.each<{
  description: string;
  config: DippedSmartCardAuthConfig;
  machineState: DippedSmartCardAuthMachineState;
  cardDetails: CardDetails;
  expectedAuthStatus: DippedSmartCardAuthTypes.AuthStatus;
  expectedLog?: Parameters<BaseLogger['log']>;
}>([
  {
    description: 'unprogrammed or invalid card',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      user: undefined,
      reason: 'unprogrammed_or_invalid_card',
    },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'unprogrammed_or_invalid_card',
      machineJurisdiction: jurisdiction,
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'unknown',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'unprogrammed_or_invalid_card',
      },
    ],
  },
  {
    description: 'card certificate expired',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: { user: undefined, reason: 'certificate_expired' },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'certificate_expired',
      machineJurisdiction: jurisdiction,
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'unknown',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'certificate_expired',
      },
    ],
  },
  {
    description: 'card certificate not yet valid',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: { user: undefined, reason: 'certificate_not_yet_valid' },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'certificate_not_yet_valid',
      machineJurisdiction: jurisdiction,
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'unknown',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'certificate_not_yet_valid',
      },
    ],
  },
  {
    description: 'wrong jurisdiction',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...systemAdministratorUser, jurisdiction: otherJurisdiction },
    },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'wrong_jurisdiction',
      cardJurisdiction: otherJurisdiction,
      cardUserRole: 'system_administrator',
      machineJurisdiction: jurisdiction,
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'wrong_jurisdiction',
      },
    ],
  },
  {
    description: 'skips jurisdiction validation if no machine jurisdiction',
    config: defaultConfig,
    machineState: { ...defaultMachineState, jurisdiction: undefined },
    cardDetails: {
      user: systemAdministratorUser,
    },
    expectedAuthStatus: {
      status: 'checking_pin',
      user: systemAdministratorUser,
    },
  },
  {
    description:
      'skips jurisdiction validation if vendor card with wildcard jurisdiction',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...vendorUser, jurisdiction: '*' },
    },
    expectedAuthStatus: {
      status: 'checking_pin',
      user: { ...vendorUser, jurisdiction: '*' },
    },
  },
  {
    description:
      'does not skip jurisdiction validation if non-vendor card with wildcard jurisdiction',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...systemAdministratorUser, jurisdiction: '*' },
    },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'wrong_jurisdiction',
      cardJurisdiction: '*',
      cardUserRole: 'system_administrator',
      machineJurisdiction: jurisdiction,
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'wrong_jurisdiction',
      },
    ],
  },
  {
    description: 'user role not allowed',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      user: pollWorkerUser,
      hasPin: false,
    },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'user_role_not_allowed',
      cardJurisdiction: jurisdiction,
      cardUserRole: 'poll_worker',
      machineJurisdiction: jurisdiction,
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
    machineState: { ...defaultMachineState, electionKey: undefined },
    cardDetails: {
      user: electionManagerUser,
    },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'machine_not_configured',
      cardJurisdiction: jurisdiction,
      cardUserRole: 'election_manager',
      machineJurisdiction: jurisdiction,
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
    machineState: { ...defaultMachineState, electionKey: undefined },
    cardDetails: {
      user: electionManagerUser,
    },
    expectedAuthStatus: {
      status: 'checking_pin',
      user: electionManagerUser,
    },
  },
  {
    description: 'mismatched election key',
    config: defaultConfig,
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...electionManagerUser, electionKey: otherElectionKey },
    },
    expectedAuthStatus: {
      status: 'logged_out',
      reason: 'wrong_election',
      cardJurisdiction: jurisdiction,
      cardUserRole: 'election_manager',
      machineJurisdiction: jurisdiction,
    },
    expectedLog: [
      LogEventId.AuthLogin,
      'election_manager',
      {
        disposition: LogDispositionStandardTypes.Failure,
        message: 'User failed login.',
        reason: 'wrong_election',
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
  expectedCardProgramInput: Parameters<ProgrammableCard['program']>[0];
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
      user: { role: 'system_administrator', jurisdiction },
      pin,
    },
    expectedProgramResult: ok({ pin }),
    cardDetailsAfterProgramming: {
      user: { role: 'system_administrator', jurisdiction },
    },
  },
  {
    description: 'election manager cards',
    machineState: defaultMachineState,
    input: { userRole: 'election_manager' },
    expectedCardProgramInput: {
      user: { role: 'election_manager', jurisdiction, electionKey },
      pin,
    },
    expectedProgramResult: ok({ pin }),
    cardDetailsAfterProgramming: {
      user: { role: 'election_manager', jurisdiction, electionKey },
    },
  },
  {
    description: 'poll worker cards',
    machineState: defaultMachineState,
    input: { userRole: 'poll_worker' },
    expectedCardProgramInput: {
      user: { role: 'poll_worker', jurisdiction, electionKey },
    },
    expectedProgramResult: ok({ pin: undefined }),
    cardDetailsAfterProgramming: {
      user: { role: 'poll_worker', jurisdiction, electionKey },
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
      user: { role: 'poll_worker', jurisdiction, electionKey },
      pin,
    },
    expectedProgramResult: ok({ pin }),
    cardDetailsAfterProgramming: {
      user: { role: 'poll_worker', jurisdiction, electionKey },
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

    mockCardStatus({
      status: 'ready',
      cardDetails: {
        user: undefined,
        reason: 'unprogrammed_or_invalid_card',
      },
    });
    expect(await auth.getAuthStatus(machineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Date),
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
      sessionExpiresAt: expect.any(Date),
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

    mockCardStatus({
      status: 'ready',
      cardDetails: {
        user: undefined,
        reason: 'unprogrammed_or_invalid_card',
      },
    });
    expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
      status: 'logged_in',
      user: systemAdministratorUser,
      sessionExpiresAt: expect.any(Date),
      programmableCard: { status: 'ready', programmedUser: undefined },
    });
  }
);

test.each<{
  description: string;
  machineState: DippedSmartCardAuthMachineState;
  cardDetails: CardDetails;
  expectedProgrammedUser?: CardDetails['user'];
}>([
  {
    description: 'treating card from another jurisdiction as unprogrammed',
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...electionManagerUser, jurisdiction: otherJurisdiction },
    },
    expectedProgrammedUser: undefined,
  },
  {
    description:
      'treating poll worker card without a PIN as unprogrammed if poll worker card PINs are enabled',
    machineState: {
      ...defaultMachineState,
      arePollWorkerCardPinsEnabled: true,
    },
    cardDetails: {
      user: { ...pollWorkerUser, jurisdiction: otherJurisdiction },
      hasPin: false,
    },
    expectedProgrammedUser: undefined,
  },
  {
    description:
      'treating poll worker card with a PIN as unprogrammed if poll worker card PINs are not enabled',
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...pollWorkerUser, jurisdiction: otherJurisdiction },
      hasPin: true,
    },
    expectedProgrammedUser: undefined,
  },
  {
    description: 'vendor card for jurisdiction',
    machineState: defaultMachineState,
    cardDetails: {
      user: vendorUser,
    },
    expectedProgrammedUser: vendorUser,
  },
  {
    description: 'vendor card for universal jurisdiction',
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...vendorUser, jurisdiction: UNIVERSAL_VENDOR_CARD_JURISDICTION },
    },
    expectedProgrammedUser: {
      ...vendorUser,
      jurisdiction: UNIVERSAL_VENDOR_CARD_JURISDICTION,
    },
  },
  {
    description: 'vendor card for other jurisdiction',
    machineState: defaultMachineState,
    cardDetails: {
      user: { ...vendorUser, jurisdiction: otherJurisdiction },
    },
    expectedProgrammedUser: undefined,
  },
])(
  'Card programming edge cases - $description',
  async ({ machineState, cardDetails, expectedProgrammedUser }) => {
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
      sessionExpiresAt: expect.any(Date),
      programmableCard: {
        status: 'ready',
        programmedUser: expectedProgrammedUser,
      },
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
    error: { error: new Error('Whoa!'), erroredAt: expect.any(Date) },
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
  await auth.checkPin(defaultMachineState, { pin });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'checking_pin',
    user: electionManagerUser,
    error: { error: new Error('Whoa!'), erroredAt: expect.any(Date) },
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
  await auth.checkPin(defaultMachineState, { pin });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'remove_card',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Date),
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
    sessionExpiresAt: new Date(),
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

  mockCardStatus({ status: 'no_card_reader' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Date),
    programmableCard: { status: 'no_card_reader' },
  });

  mockCardStatus({ status: 'card_error' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Date),
    programmableCard: { status: 'card_error' },
  });

  mockCardStatus({ status: 'unknown_error' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Date),
    programmableCard: { status: 'unknown_error' },
  });

  mockCardStatus({
    status: 'ready',
    cardDetails: {
      user: undefined,
      reason: 'unprogrammed_or_invalid_card',
    },
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Date),
    programmableCard: { status: 'ready', programmedUser: undefined },
  });

  mockCard.program
    .expectCallWith({
      user: { role: 'poll_worker', jurisdiction, electionKey },
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
      user: pollWorkerUser,
      hasPin: false,
    },
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: systemAdministratorUser,
    sessionExpiresAt: expect.any(Date),
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
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_PIN_ENTRY
  );
  const auth = new DippedSmartCardAuth({
    card: mockCard,
    config: defaultConfig,
    logger: mockLogger,
  });

  mockCardStatus({
    status: 'ready',
    cardDetails: {
      user: electionManagerUser,
    },
  });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'remove_card',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Date),
  });
  mockCardStatus({ status: 'no_card' });
  expect(await auth.getAuthStatus(defaultMachineState)).toEqual({
    status: 'logged_in',
    user: electionManagerUser,
    sessionExpiresAt: expect.any(Date),
  });
});
