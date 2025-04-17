import { beforeEach, expect, test, vi } from 'vitest';
import { deferred, err, ok, Result, sleep } from '@votingworks/basics';
import {
  advancePromises,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';

import {
  constructElectionKey,
  DippedSmartCardAuth,
  Election,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  electionFamousNames2021Fixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { AuthStatus } from '@votingworks/types/src/auth/dipped_smart_card_auth';
import { screen, within } from '../test/react_testing_library';
import { newTestContext } from '../test/test_context';
import {
  CardProgrammingApiClient,
  SmartCardsScreen,
  SmartCardsScreenProps,
} from './smart_cards_screen';

const { mockApiClient, render } = newTestContext();
const electionGeneral = readElectionGeneral();
const prettyElectionDate = /Tuesday, November 3, 2020/;
const electionKey = constructElectionKey(electionGeneral);

const electionFamousNames2021 = electionFamousNames2021Fixtures.readElection();

const baseAuth = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
} as const;

const authConfigs = {
  noCard: {
    ...baseAuth,
    programmableCard: { status: 'no_card' },
  },
  cardError: {
    ...baseAuth,
    programmableCard: { status: 'card_error' },
  },
  blankCard: {
    ...baseAuth,
    programmableCard: { status: 'ready' },
  },
  electionManagerCard: {
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockElectionManagerUser({ electionKey }),
    },
  },
  pollWorkerCard: {
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockPollWorkerUser({ electionKey }),
    },
  },
  systemAdministratorCard: {
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockSystemAdministratorUser(),
    },
  },
  vendorCard: {
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockVendorUser(),
    },
  },
} satisfies Record<string, DippedSmartCardAuth.SystemAdministratorLoggedIn>;

function defaultProps(): SmartCardsScreenProps {
  return {
    apiClient: mockApiClient,
    auth: authConfigs.systemAdministratorCard,
    election: electionGeneral,
    arePollWorkerCardPinsEnabled: false,
  };
}

function setUpMockCardProgrammingApi() {
  mockApiClient.programCard.mockImplementation(
    async (): Promise<Result<{ pin?: string }, Error>> => {
      await sleep(100);
      return ok({});
    }
  );

  mockApiClient.unprogramCard.mockImplementation(
    async (): Promise<Result<void, Error>> => {
      await sleep(100);
      return ok();
    }
  );
}

beforeEach(() => {
  setUpMockCardProgrammingApi();
});

test('renders instructions to insert card when no card is inserted', async () => {
  render(<SmartCardsScreen {...defaultProps()} auth={authConfigs.noCard} />);

  await screen.findByRole('heading', { name: 'Insert a smart card' });
});

test('renders instructions to flip card for card_error status', async () => {
  render(<SmartCardsScreen {...defaultProps()} auth={authConfigs.cardError} />);

  await screen.findByRole('heading', { name: 'Card Backward' });
});

const electionInfoTestSpecs: Array<{
  testDescription: string;
  election: Election;
  textMatcher: string | RegExp;
}> = [
  {
    testDescription: 'matching election',
    election: electionGeneral,
    textMatcher: /General Election/,
  },
  {
    testDescription: 'no matching election',
    election: electionFamousNames2021,
    textMatcher: 'Unknown Election',
  },
];

test.each(electionInfoTestSpecs)(
  'programmed election manager card renders expected ElectionInfo for case: $testDescription',
  async ({ election, textMatcher }) => {
    const programmedElectionManagerAuthStatus: DippedSmartCardAuth.SystemAdministratorLoggedIn =
      {
        ...baseAuth,
        programmableCard: {
          status: 'ready',
          programmedUser: {
            role: 'election_manager',
            jurisdiction: TEST_JURISDICTION,
            electionKey: constructElectionKey(election),
          },
        },
      };

    render(
      <SmartCardsScreen
        {...defaultProps()}
        auth={programmedElectionManagerAuthStatus}
      />
    );

    await screen.findByText(textMatcher);
  }
);

type ProgramResult = Awaited<
  ReturnType<CardProgrammingApiClient['programCard']>
>;
type UnprogramResult = Awaited<
  ReturnType<CardProgrammingApiClient['unprogramCard']>
>;

test('Insert blank card, program election manager card', async () => {
  const { rerender } = render(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.blankCard} />
  );

  await screen.findByRole('heading', { name: 'Blank Card' });

  const deferredProgram = deferred<ProgramResult>();
  mockApiClient.programCard.mockReturnValueOnce(deferredProgram.promise);

  userEvent.click(await screen.findButton('Program Election Manager Card'));
  await advancePromises();
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'election_manager',
  });

  await vi.waitFor(() => {
    expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  });
  expect(screen.getButton('Program Poll Worker Card')).toBeDisabled();
  expect(screen.getButton('Program System Administrator Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '123456' }));

  rerender(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.electionManagerCard}
    />
  );

  await screen.findByText('Election Manager Card');
  screen.getByText(new RegExp(electionGeneral.title));
  screen.getByText(prettyElectionDate);
  screen.getByText('123-456');
  screen.getByText(/Election manager card programmed/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});

test('Insert blank card, program poll worker card, PINs disabled', async () => {
  const { rerender } = render(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.blankCard} />
  );

  await screen.findByText('Blank Card');

  const deferredProgram = deferred<ProgramResult>();
  mockApiClient.programCard.mockReturnValueOnce(deferredProgram.promise);
  userEvent.click(screen.getButton('Program Poll Worker Card'));
  await advancePromises();
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'poll_worker',
  });

  await vi.waitFor(() => {
    expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  });
  expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Program System Administrator Card')).toBeDisabled();

  deferredProgram.resolve(ok({}));

  rerender(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.pollWorkerCard} />
  );
  await screen.findByText('Poll Worker Card');
  screen.getByText(new RegExp(electionGeneral.title));
  screen.getByText(prettyElectionDate);
  expect(screen.queryByText(/Record the new PIN/)).not.toBeInTheDocument();
  screen.getByText(/Poll worker card programmed/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});

test('Insert blank card, program system administrator card', async () => {
  const { rerender } = render(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.blankCard} />
  );

  await screen.findByText('Blank Card');

  userEvent.click(screen.getButton('Program System Administrator Card'));
  let confirmModal = await screen.findByRole('alertdialog');
  within(confirmModal).getByRole('heading', {
    name: 'Program System Administrator Card',
  });
  userEvent.click(within(confirmModal).getButton('Cancel'));
  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  userEvent.click(screen.getButton('Program System Administrator Card'));
  confirmModal = await screen.findByRole('alertdialog');

  const deferredProgram = deferred<ProgramResult>();
  mockApiClient.programCard.mockImplementationOnce(
    () => deferredProgram.promise
  );
  userEvent.click(
    within(confirmModal).getButton('Program System Administrator Card')
  );
  await advancePromises();
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'system_administrator',
  });

  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      screen.getButton('Program System Administrator Card')
    ).toBeDisabled();
  });
  expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Program Poll Worker Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '123456' }));

  rerender(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.systemAdministratorCard}
    />
  );
  await screen.findByText('System Administrator Card');
  screen.getByText('123-456');
  screen.getByText(/System administrator card programmed/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});

test('Insert blank card when machine is not configured', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.blankCard}
      election={undefined}
    />
  );

  await screen.findByText('Blank Card');

  expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Program Poll Worker Card')).toBeDisabled();
  expect(screen.getButton('Program System Administrator Card')).toBeEnabled();
  screen.getByText(
    'Configure VxAdmin with an election package to program election manager and poll worker cards.'
  );
});

test('Insert blank card, program system administrator card when machine is not configured', async () => {
  const { rerender } = render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.blankCard}
      election={undefined}
    />
  );

  await screen.findByText('Blank Card');

  userEvent.click(screen.getButton('Program System Administrator Card'));
  const confirmModal = await screen.findByRole('alertdialog');

  const deferredProgram = deferred<ProgramResult>();
  mockApiClient.programCard.mockImplementationOnce(
    () => deferredProgram.promise
  );
  userEvent.click(
    within(confirmModal).getButton('Program System Administrator Card')
  );
  await advancePromises();
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'system_administrator',
  });

  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      screen.getButton('Program System Administrator Card')
    ).toBeDisabled();
  });
  expect(screen.getButton('Program Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Program Poll Worker Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '123456' }));

  rerender(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.systemAdministratorCard}
      election={undefined}
    />
  );

  await screen.findByText('System Administrator Card');
  screen.getByText('123-456');
  screen.getByText(/System administrator card programmed/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});

test('Insert election manager card, unprogram', async () => {
  const { rerender } = render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.electionManagerCard}
    />
  );

  await screen.findByText('Election Manager Card');
  screen.getByText(new RegExp(electionGeneral.title));
  screen.getByText(prettyElectionDate);

  const deferredUnprogram = deferred<UnprogramResult>();
  mockApiClient.unprogramCard.mockReturnValue(deferredUnprogram.promise);
  userEvent.click(screen.getButton('Unprogram Card'));

  await advancePromises();
  expect(mockApiClient.unprogramCard).toHaveBeenCalledOnce();

  await vi.waitFor(() => {
    expect(screen.getButton('Unprogram Card')).toBeDisabled();
  });
  expect(screen.getButton('Reset Card PIN')).toBeDisabled();

  deferredUnprogram.resolve(ok());
  rerender(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.blankCard}
      election={undefined}
    />
  );
  await screen.findByText('Blank Card');
  screen.getByText('Election manager card unprogrammed.');
  screen.getButton('Program Election Manager Card');
  screen.getButton('Program Poll Worker Card');
  screen.getButton('Program System Administrator Card');
});

test('Insert election manager card, reset PIN', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.electionManagerCard}
    />
  );

  await screen.findByText('Election Manager Card');

  const deferredProgram = deferred<ProgramResult>();
  mockApiClient.programCard.mockReturnValueOnce(deferredProgram.promise);
  userEvent.click(screen.getButton('Reset Card PIN'));
  await advancePromises();
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'election_manager',
  });

  await vi.waitFor(() => {
    expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  });
  expect(screen.getButton('Unprogram Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '654321' }));
  // rerender(
  //   <SmartCardsScreen
  //     {...defaultProps()}
  //     auth={authConfigs.electionManagerCard}
  //   />
  // );
  await screen.findByText(/Election manager card PIN reset/);
  screen.getByText('Election Manager Card');
  screen.getByText('654-321');
});

test('Insert poll worker card (PINs disabled), unprogram', async () => {
  const { rerender } = render(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.pollWorkerCard} />
  );

  await screen.findByText('Poll Worker Card');
  screen.getByText(new RegExp(electionGeneral.title));
  screen.getByText(prettyElectionDate);

  expect(screen.queryButton('Reset Card PIN')).not.toBeInTheDocument();

  const deferredUnprogram = deferred<UnprogramResult>();
  mockApiClient.unprogramCard.mockReturnValueOnce(deferredUnprogram.promise);
  userEvent.click(screen.getButton('Unprogram Card'));

  await advancePromises();
  expect(mockApiClient.unprogramCard).toHaveBeenCalledOnce();

  await vi.waitFor(() => {
    expect(screen.getButton('Unprogram Card')).toBeDisabled();
  });

  deferredUnprogram.resolve(ok());
  rerender(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.blankCard} />
  );
  await screen.findByText('Blank Card');
  screen.getByText('Poll worker card unprogrammed.');
  screen.getButton('Program Election Manager Card');
  screen.getButton('Program Poll Worker Card');
  screen.getButton('Program System Administrator Card');
});

test('Insert poll worker card (PINs enabled), reset PIN', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.pollWorkerCard}
      arePollWorkerCardPinsEnabled
    />
  );

  await screen.findByText('Poll Worker Card');

  const deferredProgram = deferred<ProgramResult>();
  mockApiClient.programCard.mockReturnValueOnce(deferredProgram.promise);
  userEvent.click(screen.getButton('Reset Card PIN'));

  await advancePromises();
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'poll_worker',
  });

  await vi.waitFor(() => {
    expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  });
  expect(screen.getButton('Unprogram Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '654321' }));
  // rerender(
  //   <SmartCardsScreen
  //     {...defaultProps()}
  //     auth={authConfigs.pollWorkerCard}
  //     arePollWorkerCardPinsEnabled
  //   />
  // );
  await screen.findByText(/Poll worker card PIN reset/);
  screen.getByText('Poll Worker Card');
  screen.getByText('654-321');
});

test('Insert system administrator card, reset PIN', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.systemAdministratorCard}
    />
  );

  await screen.findByText('System Administrator Card');

  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Reset Card PIN'));
  let confirmModal = await screen.findByRole('alertdialog');
  within(confirmModal).getByRole('heading', {
    name: 'Reset System Administrator Card PIN',
  });
  userEvent.click(within(confirmModal).getButton('Cancel'));
  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  userEvent.click(screen.getButton('Reset Card PIN'));
  confirmModal = await screen.findByRole('alertdialog');

  const deferredProgram = deferred<ProgramResult>();
  mockApiClient.programCard.mockReturnValueOnce(deferredProgram.promise);
  userEvent.click(
    within(confirmModal).getButton('Reset System Administrator Card PIN')
  );

  await advancePromises();
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'system_administrator',
  });

  await vi.waitFor(() => {
    expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  });

  deferredProgram.resolve(ok({ pin: '654321' }));
  // apiMock.setAuthStatus(auth.systemAdministratorCard);
  await screen.findByText(/System administrator card PIN reset/);
  screen.getByText('System Administrator Card');
  screen.getByText('654-321');
});

test('Insert election manager card when machine is not configured', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.electionManagerCard}
      election={undefined}
    />
  );

  await screen.findByText('Election Manager Card');
  screen.getByText('Unknown Election');
  expect(screen.queryByText(prettyElectionDate)).not.toBeInTheDocument();

  expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  expect(screen.getButton('Unprogram Card')).toBeDisabled();
  screen.getByText(
    'Configure VxAdmin with an election package to enable modifying cards.'
  );
});

test('Insert poll worker card when machine is not configured (PINs enabled)', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.pollWorkerCard}
      election={undefined}
      arePollWorkerCardPinsEnabled
    />
  );

  await screen.findByText('Poll Worker Card');
  screen.getByText('Unknown Election');
  expect(screen.queryByText(prettyElectionDate)).not.toBeInTheDocument();

  expect(screen.getButton('Unprogram Card')).toBeDisabled();
  expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  screen.getByText(
    'Configure VxAdmin with an election package to enable modifying cards.'
  );
});

test('Insert system administrator card when machine is not configured', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.systemAdministratorCard}
      election={undefined}
    />
  );

  await screen.findByText('System Administrator Card');
  expect(screen.getButton('Reset Card PIN')).toBeEnabled();
});

test('Insert vendor card', async () => {
  render(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.vendorCard} />
  );

  await screen.findByText('Vendor Card');
  expect(
    screen.queryByRole('heading', { name: 'Modify Card' })
  ).not.toBeInTheDocument();
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
  expect(screen.queryButton('Reset Card PIN')).not.toBeInTheDocument();
});

test('Insert poll worker card programmed for another election (PINs enabled)', async () => {
  const authStatus: AuthStatus = {
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockPollWorkerUser({
        electionKey: constructElectionKey(electionFamousNames2021),
      }),
    },
  };

  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authStatus}
      arePollWorkerCardPinsEnabled
    />
  );

  await screen.findByText('Unknown Election');

  expect(screen.getButton('Unprogram Card')).toBeEnabled();
  expect(screen.getButton('Reset Card PIN')).toBeDisabled();
});

test('Error programming election manager card', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.blankCard}
      arePollWorkerCardPinsEnabled
    />
  );

  mockApiClient.programCard.mockResolvedValueOnce(err(new Error('test error')));

  userEvent.click(await screen.findButton('Program Election Manager Card'));

  await screen.findByText(
    'Error programming election manager card. Please try again.'
  );
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'election_manager',
  });
});

test('Error programming poll worker card', async () => {
  render(<SmartCardsScreen {...defaultProps()} auth={authConfigs.blankCard} />);

  mockApiClient.programCard.mockResolvedValueOnce(err(new Error('test error')));

  userEvent.click(await screen.findButton('Program Poll Worker Card'));

  await screen.findByText(
    'Error programming poll worker card. Please try again.'
  );
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'poll_worker',
  });
});

test('Error programming system administrator card', async () => {
  render(<SmartCardsScreen {...defaultProps()} auth={authConfigs.blankCard} />);

  mockApiClient.programCard.mockResolvedValueOnce(err(new Error('test error')));

  userEvent.click(await screen.findButton('Program System Administrator Card'));
  // Click confirmation
  userEvent.click(await screen.findButton('Program System Administrator Card'));

  await screen.findByText(
    'Error programming system administrator card. Please try again.'
  );
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'system_administrator',
  });
});

test('Error unprogramming election manager card', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.electionManagerCard}
    />
  );
  mockApiClient.unprogramCard.mockResolvedValueOnce(
    err(new Error('test error'))
  );

  userEvent.click(await screen.findButton('Unprogram Card'));

  await screen.findByText(
    'Error unprogramming election manager card. Please try again.'
  );
  expect(mockApiClient.unprogramCard).toHaveBeenCalledOnce();
});

test('Error unprogramming poll worker card', async () => {
  render(
    <SmartCardsScreen {...defaultProps()} auth={authConfigs.pollWorkerCard} />
  );
  mockApiClient.unprogramCard.mockResolvedValueOnce(
    err(new Error('test error'))
  );

  userEvent.click(await screen.findButton('Unprogram Card'));

  await screen.findByText(
    'Error unprogramming poll worker card. Please try again.'
  );
  expect(mockApiClient.unprogramCard).toHaveBeenCalledOnce();
});

test('Error resetting election manager card PIN', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.electionManagerCard}
    />
  );

  mockApiClient.programCard.mockResolvedValueOnce(err(new Error('test error')));
  userEvent.click(await screen.findButton('Reset Card PIN'));

  await screen.findByText(
    'Error resetting election manager card PIN. Please try again.'
  );
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'election_manager',
  });
});

test('Error resetting poll worker card PIN', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.pollWorkerCard}
      arePollWorkerCardPinsEnabled
    />
  );

  mockApiClient.programCard.mockResolvedValueOnce(err(new Error('test error')));
  userEvent.click(await screen.findButton('Reset Card PIN'));

  await screen.findByText(
    'Error resetting poll worker card PIN. Please try again.'
  );
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'poll_worker',
  });
});

test('Error resetting system administrator card PIN', async () => {
  render(
    <SmartCardsScreen
      {...defaultProps()}
      auth={authConfigs.systemAdministratorCard}
      arePollWorkerCardPinsEnabled
    />
  );

  mockApiClient.programCard.mockResolvedValueOnce(err(new Error('test error')));
  userEvent.click(await screen.findButton('Reset Card PIN'));
  userEvent.click(
    await screen.findButton('Reset System Administrator Card PIN')
  );

  await screen.findByText(
    'Error resetting system administrator card PIN. Please try again.'
  );
  expect(mockApiClient.programCard).toHaveBeenCalledWith({
    userRole: 'system_administrator',
  });
});
