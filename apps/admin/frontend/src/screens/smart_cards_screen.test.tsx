import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
} from '@votingworks/types';
import {
  electionGeneralDefinition,
  electionTwoPartyPrimary,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { deferred, err, ok } from '@votingworks/basics';
import { Api } from '@votingworks/admin-backend';
import { within } from '@testing-library/react';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { screen, waitFor } from '../../test/react_testing_library';
import {
  renderInAppContext,
  RenderInAppContextParams,
} from '../../test/render_in_app_context';
import { SmartCardsScreen } from './smart_cards_screen';

const electionDefinition = electionGeneralDefinition;
const { election } = electionDefinition;
const prettyElectionDate = /Tuesday, November 3, 2020/;
const electionKey = constructElectionKey(electionDefinition.election);
const otherElectionKey = constructElectionKey(electionTwoPartyPrimary);

let apiMock: ApiMock;

function renderScreen(params: RenderInAppContextParams = {}) {
  return renderInAppContext(<SmartCardsScreen />, {
    electionDefinition,
    ...params,
  });
}

const baseAuth = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
} as const;

const auth = {
  noCard: {
    ...baseAuth,
    programmableCard: { status: 'no_card' },
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

function enablePollWorkerCardPins() {
  apiMock.apiClient.getSystemSettings.reset();
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    auth: {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      arePollWorkerCardPinsEnabled: true,
    },
  });
}

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('Insert card prompt', async () => {
  apiMock.setAuthStatus(auth.noCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });
  screen.getByText('Insert a Smart Card');

  expect(screen.getButton('Create Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Create Poll Worker Card')).toBeDisabled();
  expect(screen.getButton('Create System Administrator Card')).toBeDisabled();
});

test('Insert blank card, create election manager card', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Blank Card');

  const deferredProgram = deferred<Awaited<ReturnType<Api['programCard']>>>();
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'election_manager' })
    .returns(deferredProgram.promise);
  userEvent.click(screen.getButton('Create Election Manager Card'));
  await waitFor(() => {
    expect(screen.getButton('Create Election Manager Card')).toBeDisabled();
  });
  expect(screen.getButton('Create Poll Worker Card')).toBeDisabled();
  expect(screen.getButton('Create System Administrator Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '123456' }));
  apiMock.setAuthStatus(auth.electionManagerCard);
  await screen.findByText('Election Manager Card');
  screen.getByText(election.title);
  screen.getByText(prettyElectionDate);
  screen.getByText('123-456');
  screen.getByText(/Election manager card created/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});

test('Insert blank card, create poll worker card, PINs disabled', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Blank Card');

  const deferredProgram = deferred<Awaited<ReturnType<Api['programCard']>>>();
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'poll_worker' })
    .returns(deferredProgram.promise);
  userEvent.click(screen.getButton('Create Poll Worker Card'));
  await waitFor(() => {
    expect(screen.getButton('Create Election Manager Card')).toBeDisabled();
  });
  expect(screen.getButton('Create Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Create System Administrator Card')).toBeDisabled();

  deferredProgram.resolve(ok({}));
  apiMock.setAuthStatus(auth.pollWorkerCard);
  await screen.findByText('Poll Worker Card');
  screen.getByText(election.title);
  screen.getByText(prettyElectionDate);
  expect(screen.queryByText(/Record the new PIN/)).not.toBeInTheDocument();
  screen.getByText(/Poll worker card created/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});

test('Insert blank card, create poll worker card, PINs enabled', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  enablePollWorkerCardPins();
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Blank Card');

  apiMock.expectProgramCard('poll_worker', '123456');
  userEvent.click(screen.getButton('Create Poll Worker Card'));

  apiMock.setAuthStatus(auth.pollWorkerCard);
  await screen.findByText('Poll Worker Card');
  screen.getByText(election.title);
  screen.getByText(prettyElectionDate);
  screen.getByText('123-456');
  screen.getByText(/Poll worker card created/);
});

test('Insert blank card, create system administrator card', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Blank Card');

  userEvent.click(screen.getButton('Create System Administrator Card'));
  let confirmModal = await screen.findByRole('alertdialog');
  within(confirmModal).getByText('Create System Administrator Card?');
  userEvent.click(within(confirmModal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  userEvent.click(screen.getButton('Create System Administrator Card'));
  confirmModal = await screen.findByRole('alertdialog');

  const deferredProgram = deferred<Awaited<ReturnType<Api['programCard']>>>();
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'system_administrator' })
    .returns(deferredProgram.promise);
  userEvent.click(
    within(confirmModal).getByRole('button', {
      name: 'Create System Administrator Card',
    })
  );
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getButton('Create System Administrator Card')).toBeDisabled();
  });
  expect(screen.getButton('Create Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Create Poll Worker Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '123456' }));
  apiMock.setAuthStatus(auth.systemAdministratorCard);
  await screen.findByText('System Administrator Card');
  screen.getByText('123-456');
  screen.getByText(/System administrator card created/);
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
});

test('Insert blank card when machine is not configured', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock, electionDefinition: null });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Blank Card');

  expect(screen.getButton('Create Election Manager Card')).toBeDisabled();
  expect(screen.getButton('Create Poll Worker Card')).toBeDisabled();
  expect(screen.getButton('Create System Administrator Card')).toBeEnabled();
  screen.getByText(
    'Configure VxAdmin with an election package to create election manager and poll worker cards.'
  );
});

test('Insert election manager card, unprogram', async () => {
  apiMock.setAuthStatus(auth.electionManagerCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Election Manager Card');
  screen.getByText(election.title);
  screen.getByText(prettyElectionDate);

  const deferredUnprogram =
    deferred<Awaited<ReturnType<Api['unprogramCard']>>>();
  apiMock.apiClient.unprogramCard
    .expectCallWith()
    .returns(deferredUnprogram.promise);
  userEvent.click(screen.getButton('Unprogram Card'));

  await waitFor(() => {
    expect(screen.getButton('Unprogram Card')).toBeDisabled();
  });
  expect(screen.getButton('Reset Card PIN')).toBeDisabled();

  deferredUnprogram.resolve(ok());
  apiMock.setAuthStatus(auth.blankCard);
  await screen.findByText('Blank Card');
  screen.getByText('Election manager card has been unprogrammed.');
  screen.getButton('Create Election Manager Card');
  screen.getButton('Create Poll Worker Card');
  screen.getButton('Create System Administrator Card');
});

test('Insert election manager card, reset PIN', async () => {
  apiMock.setAuthStatus(auth.electionManagerCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Election Manager Card');

  const deferredProgram = deferred<Awaited<ReturnType<Api['programCard']>>>();
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'election_manager' })
    .returns(deferredProgram.promise);
  userEvent.click(screen.getButton('Reset Card PIN'));

  await waitFor(() => {
    expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  });
  expect(screen.getButton('Unprogram Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '654321' }));
  apiMock.setAuthStatus(auth.electionManagerCard);
  await screen.findByText(/Election manager card PIN has been reset/);
  screen.getByText('Election Manager Card');
  screen.getByText('654-321');
});

test('Insert poll worker card (PINs disabled), unprogram', async () => {
  apiMock.setAuthStatus(auth.pollWorkerCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Poll Worker Card');
  screen.getByText(election.title);
  screen.getByText(prettyElectionDate);

  expect(screen.queryButton('Reset Card PIN')).not.toBeInTheDocument();

  const deferredUnprogram =
    deferred<Awaited<ReturnType<Api['unprogramCard']>>>();
  apiMock.apiClient.unprogramCard
    .expectCallWith()
    .returns(deferredUnprogram.promise);
  userEvent.click(screen.getButton('Unprogram Card'));

  await waitFor(() => {
    expect(screen.getButton('Unprogram Card')).toBeDisabled();
  });

  deferredUnprogram.resolve(ok());
  apiMock.setAuthStatus(auth.blankCard);
  await screen.findByText('Blank Card');
  screen.getByText('Poll worker card has been unprogrammed.');
  screen.getButton('Create Election Manager Card');
  screen.getButton('Create Poll Worker Card');
  screen.getButton('Create System Administrator Card');
});

test('Insert poll worker card (PINs enabled), reset PIN', async () => {
  apiMock.setAuthStatus(auth.pollWorkerCard);
  enablePollWorkerCardPins();
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Poll Worker Card');

  const deferredProgram = deferred<Awaited<ReturnType<Api['programCard']>>>();
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'poll_worker' })
    .returns(deferredProgram.promise);
  userEvent.click(screen.getButton('Reset Card PIN'));

  await waitFor(() => {
    expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  });
  expect(screen.getButton('Unprogram Card')).toBeDisabled();

  deferredProgram.resolve(ok({ pin: '654321' }));
  apiMock.setAuthStatus(auth.pollWorkerCard);
  await screen.findByText(/Poll worker card PIN has been reset/);
  screen.getByText('Poll Worker Card');
  screen.getByText('654-321');
});

test('Insert system administrator card, reset PIN', async () => {
  apiMock.setAuthStatus(auth.systemAdministratorCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('System Administrator Card');

  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Reset Card PIN'));
  let confirmModal = await screen.findByRole('alertdialog');
  within(confirmModal).getByText('Reset System Administrator Card PIN?');
  userEvent.click(within(confirmModal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  userEvent.click(screen.getButton('Reset Card PIN'));
  confirmModal = await screen.findByRole('alertdialog');

  const deferredProgram = deferred<Awaited<ReturnType<Api['programCard']>>>();
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'system_administrator' })
    .returns(deferredProgram.promise);
  userEvent.click(
    within(confirmModal).getByRole('button', {
      name: 'Reset System Administrator Card PIN',
    })
  );

  await waitFor(() => {
    expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  });

  deferredProgram.resolve(ok({ pin: '654321' }));
  apiMock.setAuthStatus(auth.systemAdministratorCard);
  await screen.findByText(/System administrator card PIN has been reset/);
  screen.getByText('System Administrator Card');
  screen.getByText('654-321');
});

test('Insert election manager card when machine is not configured', async () => {
  apiMock.setAuthStatus(auth.electionManagerCard);
  renderScreen({ apiMock, electionDefinition: null });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Election Manager Card');
  screen.getByText('Unknown Election');
  expect(screen.queryByText(prettyElectionDate)).not.toBeInTheDocument();

  expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  expect(screen.getButton('Unprogram Card')).toBeDisabled();
  screen.getByText(
    'Configure VxAdmin with an election package to enable modifying cards.'
  );
});

test('Insert poll worker card when machine is not configured (PINs enabled)', async () => {
  apiMock.setAuthStatus(auth.pollWorkerCard);
  enablePollWorkerCardPins();
  renderScreen({ apiMock, electionDefinition: null });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Poll Worker Card');
  screen.getByText('Unknown Election');
  expect(screen.queryByText(prettyElectionDate)).not.toBeInTheDocument();

  expect(screen.getButton('Unprogram Card')).toBeDisabled();
  expect(screen.getButton('Reset Card PIN')).toBeDisabled();
  screen.getByText(
    'Configure VxAdmin with an election package to enable modifying cards.'
  );
});

test('Insert system administrator card when machine is not configured', async () => {
  apiMock.setAuthStatus(auth.systemAdministratorCard);
  renderScreen({ apiMock, electionDefinition: null });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('System Administrator Card');
  expect(screen.getButton('Reset Card PIN')).toBeEnabled();
});

test('Insert vendor card', async () => {
  apiMock.setAuthStatus(auth.vendorCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  screen.getByText('Vendor Card');
  expect(screen.queryButton('Unprogram Card')).not.toBeInTheDocument();
  expect(screen.queryButton('Reset Card PIN')).not.toBeInTheDocument();
});

test('Insert election manager card programmed for another election', async () => {
  apiMock.setAuthStatus({
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockElectionManagerUser({
        electionKey: otherElectionKey,
      }),
    },
  });
  renderScreen({ apiMock });

  await screen.findByText('Election Manager Card');
  screen.getByText('Unknown Election');

  expect(screen.getButton('Unprogram Card')).toBeEnabled();
  expect(screen.getButton('Reset Card PIN')).toBeDisabled();
});

test('Insert poll worker card programmed for another election (PINs enabled)', async () => {
  apiMock.setAuthStatus({
    ...baseAuth,
    programmableCard: {
      status: 'ready',
      programmedUser: mockPollWorkerUser({ electionKey: otherElectionKey }),
    },
  });
  enablePollWorkerCardPins();
  renderScreen({ apiMock });

  await screen.findByText('Poll Worker Card');
  screen.getByText('Unknown Election');

  expect(screen.getButton('Unprogram Card')).toBeEnabled();
  expect(screen.getButton('Reset Card PIN')).toBeDisabled();
});

test('Insert card backwards', async () => {
  apiMock.setAuthStatus({
    ...baseAuth,
    programmableCard: { status: 'card_error' },
  });
  renderScreen({ apiMock });

  await screen.findByText('Card is Backwards');
});

test('Error creating election manager card', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'election_manager' })
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Create Election Manager Card'));

  await screen.findByText(
    'Error creating election manager card. Please try again.'
  );
});

test('Error creating poll worker card', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'poll_worker' })
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Create Poll Worker Card'));

  await screen.findByText('Error creating poll worker card. Please try again.');
});

test('Error creating system administrator card', async () => {
  apiMock.setAuthStatus(auth.blankCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'system_administrator' })
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Create System Administrator Card'));
  userEvent.click(screen.getButton('Create System Administrator Card'));

  await screen.findByText(
    'Error creating system administrator card. Please try again.'
  );
});

test('Error unprogramming election manager card', async () => {
  apiMock.setAuthStatus(auth.electionManagerCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.unprogramCard
    .expectCallWith()
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Unprogram Card'));

  await screen.findByText(
    'Error unprogramming election manager card. Please try again.'
  );
});

test('Error unprogramming poll worker card', async () => {
  apiMock.setAuthStatus(auth.pollWorkerCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.unprogramCard
    .expectCallWith()
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Unprogram Card'));

  await screen.findByText(
    'Error unprogramming poll worker card. Please try again.'
  );
});

test('Error resetting election manager card PIN', async () => {
  apiMock.setAuthStatus(auth.electionManagerCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'election_manager' })
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Reset Card PIN'));

  await screen.findByText(
    'Error resetting election manager card PIN. Please try again.'
  );
});

test('Error resetting poll worker card PIN', async () => {
  apiMock.setAuthStatus(auth.pollWorkerCard);
  enablePollWorkerCardPins();
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'poll_worker' })
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Reset Card PIN'));

  await screen.findByText(
    'Error resetting poll worker card PIN. Please try again.'
  );
});

test('Error resetting system administrator card PIN', async () => {
  apiMock.setAuthStatus(auth.systemAdministratorCard);
  renderScreen({ apiMock });

  await screen.findByRole('heading', { name: 'Smart Cards' });

  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'system_administrator' })
    .resolves(err(new Error('test error')));
  userEvent.click(screen.getButton('Reset Card PIN'));
  userEvent.click(screen.getButton('Reset System Administrator Card PIN'));

  await screen.findByText(
    'Error resetting system administrator card PIN. Please try again.'
  );
});
