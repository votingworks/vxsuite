import fetchMock from 'fetch-mock';
import userEvent from '@testing-library/user-event';
import {
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  UserWithCard,
} from '@votingworks/types';
import {
  electionSampleDefinition,
  electionSample2Definition,
} from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { err, throwIllegalValue, typedAs } from '@votingworks/basics';
import { screen, waitFor, within } from '../../../test/react_testing_library';

import { ApiMock, createApiMock } from '../../../test/helpers/api_mock';
import { MachineConfig } from '../../config/types';
import { VxFiles } from '../../lib/converters';
import { buildApp } from '../../../test/helpers/build_app';

const electionDefinition = electionSampleDefinition;
const { electionHash } = electionDefinition;
const otherElectionHash = electionSample2Definition.electionHash;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });

  fetchMock.reset();
  fetchMock.get(
    '/convert/election/files',
    typedAs<VxFiles>({ inputFiles: [], outputFiles: [] })
  );
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfig>({ codeVersion: '', machineId: '' })
  );
});

afterEach(() => {
  apiMock.assertComplete();
});

test('Smartcard modal displays card details', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  const testCases: Array<{
    programmedUser: UserWithCard;
    expectedHeading: string;
    expectedElectionString?: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
    shouldUnprogramCardButtonBeDisplayed: boolean;
    expectedFooter: string;
  }> = [
    {
      programmedUser: fakeSystemAdministratorUser(),
      expectedHeading: 'System Administrator Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: false,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: fakeElectionManagerUser({ electionHash }),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: fakePollWorkerUser({ electionHash }),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: fakeElectionManagerUser({
        electionHash: otherElectionHash,
      }),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: fakePollWorkerUser({ electionHash: otherElectionHash }),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const {
      programmedUser,
      expectedHeading,
      expectedElectionString,
      shouldResetCardPinButtonBeDisplayed,
      shouldUnprogramCardButtonBeDisplayed,
      expectedFooter,
    } = testCase;

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser },
    });

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: expectedHeading });
    if (expectedElectionString) {
      within(modal).getByText(expectedElectionString);
    }
    if (shouldResetCardPinButtonBeDisplayed) {
      within(modal).getByRole('button', { name: 'Reset Card PIN' });
    } else {
      expect(
        within(modal).queryByRole('button', { name: 'Reset Card PIN' })
      ).not.toBeInTheDocument();
    }
    if (shouldUnprogramCardButtonBeDisplayed) {
      within(modal).getByRole('button', { name: 'Unprogram Card' });
    } else {
      expect(
        within(modal).queryByRole('button', { name: 'Unprogram Card' })
      ).not.toBeInTheDocument();
    }
    within(modal).getByText(expectedFooter);

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    await screen.findByRole('heading', { name: 'Election Definition' });
  }
});

test('Smartcard modal displays card details when no election definition on machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  const testCases: Array<{
    programmedUser: UserWithCard;
    expectedHeading: string;
    expectedElectionString?: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
    shouldElectionDefinitionPromptBeDisplayed: boolean;
    expectedFooter: string;
  }> = [
    {
      programmedUser: fakeSystemAdministratorUser(),
      expectedHeading: 'System Administrator Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      shouldElectionDefinitionPromptBeDisplayed: false,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: fakeElectionManagerUser({ electionHash }),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      programmedUser: fakePollWorkerUser({ electionHash }),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
  ];

  await screen.findByRole('heading', { name: 'Configure VxAdmin' });

  for (const testCase of testCases) {
    const {
      programmedUser,
      expectedHeading,
      expectedElectionString,
      shouldResetCardPinButtonBeDisplayed,
      shouldElectionDefinitionPromptBeDisplayed,
      expectedFooter,
    } = testCase;

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser },
    });

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: expectedHeading });
    if (expectedElectionString) {
      within(modal).getByText(expectedElectionString);
    }
    if (shouldResetCardPinButtonBeDisplayed) {
      within(modal).getByRole('button', { name: 'Reset Card PIN' });
    } else {
      expect(
        within(modal).queryByRole('button', { name: 'Reset Card PIN' })
      ).not.toBeInTheDocument();
    }
    expect(
      within(modal).queryByRole('button', { name: 'Unprogram Card' })
    ).not.toBeInTheDocument();
    if (shouldElectionDefinitionPromptBeDisplayed) {
      within(modal).getByText(
        'An election must be defined before cards can be created.'
      );
    } else {
      expect(
        within(modal).queryByText(
          'An election must be defined before cards can be created.'
        )
      ).not.toBeInTheDocument();
    }
    within(modal).getByText(expectedFooter);

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  }
});

test('Programming election manager and poll worker smartcards', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  const testCases: Array<{
    role: ElectionManagerUser['role'] | PollWorkerUser['role'];
    programmedUser: ElectionManagerUser | PollWorkerUser;
    expectedHeadingAfterProgramming: string;
    expectedSuccessText: Array<string | RegExp>;
  }> = [
    {
      role: 'election_manager',
      programmedUser: fakeElectionManagerUser({ electionHash }),
      expectedHeadingAfterProgramming: 'Election Manager Card',
      expectedSuccessText: [/New card PIN is /, '123-456'],
    },
    {
      role: 'poll_worker',
      programmedUser: fakePollWorkerUser({ electionHash }),
      expectedHeadingAfterProgramming: 'Poll Worker Card',
      expectedSuccessText: ['New card created.'],
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const {
      role,
      programmedUser,
      expectedHeadingAfterProgramming,
      expectedSuccessText,
    } = testCase;

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser: undefined },
    });

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Create New Election Card' });
    within(modal).getByText('General Election — Tuesday, November 3, 2020');
    const electionManagerCardButton = within(modal).getByRole('button', {
      name: 'Election Manager Card',
    });
    const pollWorkerCardButton = within(modal).getByRole('button', {
      name: 'Poll Worker Card',
    });
    within(modal).getByText('Remove card to cancel.');
    apiMock.expectProgramCard(role);
    switch (role) {
      case 'election_manager': {
        userEvent.click(electionManagerCardButton);
        break;
      }
      case 'poll_worker': {
        userEvent.click(pollWorkerCardButton);
        break;
      }
      default: {
        throwIllegalValue(role);
      }
    }
    await screen.findByText(/Programming card/);
    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser },
    });
    await within(modal).findByRole('heading', {
      name: expectedHeadingAfterProgramming,
    });
    within(modal).getByText('General Election — Tuesday, November 3, 2020');
    for (const text of expectedSuccessText) {
      within(modal).getByText(text);
    }
    within(modal).getByText('Remove card to continue.');

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, finding by role doesn't work here, though 'Election Definition' is present
    // in a heading
    await screen.findByText('Election Definition');
  }
});

test('Programming system administrator smartcards', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  // Programming system administrator smartcards requires being on a specific screen
  userEvent.click(await screen.findByText('Smartcards'));
  userEvent.click(await screen.findByText('Create System Administrator Cards'));
  await screen.findByRole('heading', { name: 'System Administrator Cards' });

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'ready', programmedUser: undefined },
  });

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Create New System Administrator Card',
  });
  within(modal).getByText(
    'This card performs all system actions. ' +
      'Strictly limit the number created and keep all System Administrator cards secure.'
  );
  const systemAdministratorCardButton = within(modal).getByRole('button', {
    name: 'Create System Administrator Card',
  });
  within(modal).getByText('Remove card to cancel.');
  apiMock.expectProgramCard('system_administrator');
  userEvent.click(systemAdministratorCardButton);
  await screen.findByText(/Programming card/);
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: {
      status: 'ready',
      programmedUser: fakeSystemAdministratorUser(),
    },
  });
  await within(modal).findByRole('heading', {
    name: 'System Administrator Card',
  });
  within(modal).getByText(/New card PIN is /);
  within(modal).getByText('123-456');
  within(modal).getByText('Remove card to continue.');

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  // For some reason, finding by role doesn't work here, though 'System Administrator Cards' is
  // present in a heading
  await screen.findByText('System Administrator Cards');
});

test('Programming smartcards when no election definition on machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'ready', programmedUser: undefined },
  });

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Create New Election Card' });
  within(modal).getByText(
    'An election must be defined before cards can be created.'
  );
  expect(
    within(modal).queryByRole('button', { name: 'Election Manager Card' })
  ).not.toBeInTheDocument();
  expect(
    within(modal).queryByRole('button', { name: 'Poll Worker Card' })
  ).not.toBeInTheDocument();
  within(modal).getByText('Remove card to leave this screen.');

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
});

test('Resetting smartcard PINs', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  const testCases: Array<{
    programmedUser: SystemAdministratorUser | ElectionManagerUser;
    expectedHeading: string;
  }> = [
    {
      programmedUser: fakeSystemAdministratorUser(),
      expectedHeading: 'System Administrator Card',
    },
    {
      programmedUser: fakeElectionManagerUser({ electionHash }),
      expectedHeading: 'Election Manager Card',
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const { programmedUser, expectedHeading } = testCase;

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser },
    });

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: expectedHeading });
    apiMock.expectProgramCard(programmedUser.role);
    userEvent.click(
      within(modal).getByRole('button', { name: 'Reset Card PIN' })
    );
    await screen.findByText(/Resetting card PIN/);
    await within(modal).findByText(/New card PIN is /);
    await within(modal).findByText('123-456');
    within(modal).getByText('Remove card to continue.');

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, finding by role doesn't work here, though 'Election Definition' is present
    // in a heading
    await screen.findByText('Election Definition');
  }
});

test('Resetting system administrator smartcard PINs when no election definition on machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  await screen.findByRole('heading', { name: 'Configure VxAdmin' });

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: {
      status: 'ready',
      programmedUser: fakeSystemAdministratorUser(),
    },
  });

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'System Administrator Card' });
  apiMock.expectProgramCard('system_administrator');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Reset Card PIN' })
  );
  await screen.findByText(/Resetting card PIN/);
  await within(modal).findByText(/New card PIN is /);
  await within(modal).findByText('123-456');
  within(modal).getByText('Remove card to continue.');

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  // For some reason, finding by role doesn't work here, though 'Configure VxAdmin' is present in a
  // heading
  await screen.findByText('Configure VxAdmin');
});

test('Unprogramming smartcards', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  const testCases: Array<{
    programmedUser: UserWithCard;
    expectedHeadingBeforeUnprogramming: string;
    expectedSuccessText: string;
  }> = [
    {
      programmedUser: fakeElectionManagerUser({ electionHash }),
      expectedHeadingBeforeUnprogramming: 'Election Manager Card',
      expectedSuccessText: 'Election Manager card has been unprogrammed.',
    },
    {
      programmedUser: fakePollWorkerUser({ electionHash }),
      expectedHeadingBeforeUnprogramming: 'Poll Worker Card',
      expectedSuccessText: 'Poll Worker card has been unprogrammed.',
    },
  ];

  for (const testCase of testCases) {
    const {
      programmedUser,
      expectedHeadingBeforeUnprogramming,
      expectedSuccessText,
    } = testCase;

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser },
    });

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', {
      name: expectedHeadingBeforeUnprogramming,
    });
    apiMock.expectUnprogramCard();
    userEvent.click(
      within(modal).getByRole('button', { name: 'Unprogram Card' })
    );
    await screen.findByText(/Unprogramming card/);
    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser: undefined },
    });
    await within(modal).findByRole('heading', {
      name: 'Create New Election Card',
    });
    within(modal).getByText(expectedSuccessText);

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, finding by role doesn't work here, though 'Election Definition' is present
    // in a heading
    await screen.findByText('Election Definition');
  }
});

test('Error handling', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  const testCases: Array<{
    beginFromSuperAdminCardsScreen?: boolean;
    programmedUser?: UserWithCard;
    buttonToPress: string;
    expectedProgressText: string;
    expectedErrorText: string;
  }> = [
    {
      programmedUser: undefined,
      buttonToPress: 'Election Manager Card',
      expectedProgressText: 'Programming card',
      expectedErrorText:
        'Error creating Election Manager card. Please try again.',
    },
    {
      programmedUser: undefined,
      buttonToPress: 'Poll Worker Card',
      expectedProgressText: 'Programming card',
      expectedErrorText: 'Error creating Poll Worker card. Please try again.',
    },
    {
      beginFromSuperAdminCardsScreen: true,
      programmedUser: undefined,
      buttonToPress: 'Create System Administrator Card',
      expectedProgressText: 'Programming card',
      expectedErrorText:
        'Error creating System Administrator card. Please try again.',
    },
    {
      programmedUser: fakeElectionManagerUser({ electionHash }),
      buttonToPress: 'Reset Card PIN',
      expectedProgressText: 'Resetting card PIN',
      expectedErrorText:
        'Error resetting Election Manager card PIN. Please try again.',
    },
    {
      programmedUser: fakeElectionManagerUser({ electionHash }),
      buttonToPress: 'Unprogram Card',
      expectedProgressText: 'Unprogramming card',
      expectedErrorText:
        'Error unprogramming Election Manager card. Please try again.',
    },
    {
      programmedUser: fakePollWorkerUser({ electionHash }),
      buttonToPress: 'Unprogram Card',
      expectedProgressText: 'Unprogramming card',
      expectedErrorText:
        'Error unprogramming Poll Worker card. Please try again.',
    },
  ];

  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'election_manager' })
    .resolves(err(new Error('Whoa!')));
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'poll_worker' })
    .resolves(err(new Error('Whoa!')));
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'system_administrator' })
    .resolves(err(new Error('Whoa!')));
  apiMock.apiClient.programCard
    .expectCallWith({ userRole: 'election_manager' })
    .resolves(err(new Error('Whoa!')));
  apiMock.apiClient.unprogramCard
    .expectCallWith()
    .resolves(err(new Error('Whoa!')));
  apiMock.apiClient.unprogramCard
    .expectCallWith()
    .resolves(err(new Error('Whoa!')));

  for (const testCase of testCases) {
    const {
      beginFromSuperAdminCardsScreen,
      programmedUser,
      buttonToPress,
      expectedProgressText,
      expectedErrorText,
    } = testCase;

    if (beginFromSuperAdminCardsScreen) {
      userEvent.click(screen.getByText('Smartcards'));
      userEvent.click(
        await screen.findByText('Create System Administrator Cards')
      );
      await screen.findByText('System Administrator Cards');
    } else {
      userEvent.click(screen.getByText('Smartcards'));
      await screen.findByText('Election Cards');
    }

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'ready', programmedUser },
    });

    const modal = await screen.findByRole('alertdialog');
    userEvent.click(within(modal).getByRole('button', { name: buttonToPress }));
    await screen.findByText(new RegExp(expectedProgressText));
    await within(modal).findByText(expectedErrorText);

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: fakeSystemAdministratorUser(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  }
});

test('Card inserted backwards is handled with message', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecords([]);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'error' },
  });
  await screen.findByText('Card is Backwards');

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
