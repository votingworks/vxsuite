import userEvent from '@testing-library/user-event';
import { err, throwIllegalValue } from '@votingworks/basics';
import {
  electionTwoPartyPrimaryDefinition,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  UserWithCard,
} from '@votingworks/types';

import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { buildApp } from '../../../test/helpers/build_app';
import { screen, waitFor, within } from '../../../test/react_testing_library';

const electionDefinition = electionGeneralDefinition;
const { electionHash } = electionDefinition;
const otherElectionHash = electionTwoPartyPrimaryDefinition.electionHash;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.setPrinterStatus();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetUsbDriveStatus('no_drive');
});

afterEach(() => {
  apiMock.assertComplete();
});

test('Smartcard modal displays card details', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
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
      programmedUser: mockVendorUser(),
      expectedHeading: 'Vendor Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: false,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      programmedUser: mockSystemAdministratorUser(),
      expectedHeading: 'System Administrator Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: false,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: mockElectionManagerUser({ electionHash }),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: mockPollWorkerUser({ electionHash }),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: mockElectionManagerUser({
        electionHash: otherElectionHash,
      }),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: mockPollWorkerUser({ electionHash: otherElectionHash }),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election' });

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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    await screen.findByRole('heading', { name: 'Election' });
  }
});

test('Smartcard modal displays card details when no election definition on machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.expectGetCurrentElectionMetadata(null);
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
      programmedUser: mockVendorUser(),
      expectedHeading: 'Vendor Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      programmedUser: mockSystemAdministratorUser(),
      expectedHeading: 'System Administrator Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      shouldElectionDefinitionPromptBeDisplayed: false,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      programmedUser: mockElectionManagerUser({ electionHash }),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      programmedUser: mockPollWorkerUser({ electionHash }),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
  ];

  await screen.findByRole('heading', { name: 'Election' });

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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    await screen.findByRole('heading', { name: 'Election' });
  }
});

test('Programming election manager and poll worker smartcards', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  const testCases: Array<{
    role: ElectionManagerUser['role'] | PollWorkerUser['role'];
    programmedUser: ElectionManagerUser | PollWorkerUser;
    newPin?: string;
    expectedHeadingAfterProgramming: string;
    expectedSuccessText: Array<string | RegExp>;
  }> = [
    {
      role: 'election_manager',
      programmedUser: mockElectionManagerUser({ electionHash }),
      newPin: '123456',
      expectedHeadingAfterProgramming: 'Election Manager Card',
      expectedSuccessText: [/New card PIN is /, '123-456'],
    },
    {
      role: 'poll_worker',
      programmedUser: mockPollWorkerUser({ electionHash }),
      newPin: undefined, // Poll worker card PINs are not enabled
      expectedHeadingAfterProgramming: 'Poll Worker Card',
      expectedSuccessText: ['New card created.'],
    },
    {
      role: 'poll_worker',
      programmedUser: mockPollWorkerUser({ electionHash }),
      newPin: '123456', // Poll worker card PINs are enabled
      expectedHeadingAfterProgramming: 'Poll Worker Card',
      expectedSuccessText: [/New card PIN is /, '123-456'],
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election' });

  for (const testCase of testCases) {
    const {
      role,
      programmedUser,
      newPin,
      expectedHeadingAfterProgramming,
      expectedSuccessText,
    } = testCase;

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
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
    apiMock.expectProgramCard(role, newPin);
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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, we need to use the "hidden" option here, even though the
    // heading is not hidden
    await screen.findByRole('heading', { name: 'Election', hidden: true });
  }
});

test('Programming system administrator smartcards', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  // Programming system administrator smartcards requires being on a specific screen
  userEvent.click(await screen.findByText('Smartcards'));
  userEvent.click(await screen.findByText('Create System Administrator Cards'));
  await screen.findByRole('heading', { name: 'System Administrator Cards' });

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'ready', programmedUser: undefined },
  });

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Create New System Administrator Card',
  });
  within(modal).getByText(/keep all System Administrator cards secure/i);
  const systemAdministratorCardButton = within(modal).getByRole('button', {
    name: 'Create System Administrator Card',
  });
  within(modal).getByText('Remove card to cancel.');
  apiMock.expectProgramCard('system_administrator', '123456');
  userEvent.click(systemAdministratorCardButton);
  await screen.findByText(/Programming card/);
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: {
      status: 'ready',
      programmedUser: mockSystemAdministratorUser(),
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
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
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
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.expectGetCurrentElectionMetadata(null);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();
  await screen.findByRole('heading', { name: 'Election' });

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
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
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await screen.findByRole('heading', { name: 'Election' });
});

test('Resetting smartcard PINs', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.apiClient.getSystemSettings.reset();
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    auth: {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      arePollWorkerCardPinsEnabled: true,
    },
  });
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  const testCases: Array<{
    programmedUser:
      | SystemAdministratorUser
      | ElectionManagerUser
      | PollWorkerUser;
    expectedHeading: string;
  }> = [
    {
      programmedUser: mockSystemAdministratorUser(),
      expectedHeading: 'System Administrator Card',
    },
    {
      programmedUser: mockElectionManagerUser({ electionHash }),
      expectedHeading: 'Election Manager Card',
    },
    {
      programmedUser: mockPollWorkerUser({ electionHash }),
      expectedHeading: 'Poll Worker Card',
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election' });

  for (const testCase of testCases) {
    const { programmedUser, expectedHeading } = testCase;

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'ready', programmedUser },
    });

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: expectedHeading });
    apiMock.expectProgramCard(programmedUser.role, '123456');
    userEvent.click(
      within(modal).getByRole('button', { name: 'Reset Card PIN' })
    );
    await screen.findByText(/Resetting card PIN/);
    await within(modal).findByText(/New card PIN is /);
    await within(modal).findByText('123-456');
    within(modal).getByText('Remove card to continue.');

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, we need to use the "hidden" option here, even though the
    // heading is not hidden
    await screen.findByRole('heading', { name: 'Election', hidden: true });
  }
});

test('Resetting system administrator smartcard PINs when no election definition on machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.expectGetCurrentElectionMetadata(null);
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  await screen.findByRole('heading', { name: 'Election' });

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: {
      status: 'ready',
      programmedUser: mockSystemAdministratorUser(),
    },
  });

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'System Administrator Card' });
  apiMock.expectProgramCard('system_administrator', '123456');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Reset Card PIN' })
  );
  await screen.findByText(/Resetting card PIN/);
  await within(modal).findByText(/New card PIN is /);
  await within(modal).findByText('123-456');
  within(modal).getByText('Remove card to continue.');

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await screen.findByText('Select an election package to configure VxAdmin');
});

test('Unprogramming smartcards', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election' });

  const testCases: Array<{
    programmedUser: UserWithCard;
    expectedHeadingBeforeUnprogramming: string;
    expectedSuccessText: string;
  }> = [
    {
      programmedUser: mockElectionManagerUser({ electionHash }),
      expectedHeadingBeforeUnprogramming: 'Election Manager Card',
      expectedSuccessText: 'Election Manager card has been unprogrammed.',
    },
    {
      programmedUser: mockPollWorkerUser({ electionHash }),
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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'ready', programmedUser: undefined },
    });
    await within(modal).findByRole('heading', {
      name: 'Create New Election Card',
    });
    within(modal).getByText(expectedSuccessText);

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, we need to use the "hidden" option here, even though the
    // heading is not hidden
    await screen.findByRole('heading', { name: 'Election', hidden: true });
  }
});

test('Error handling', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
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
      programmedUser: mockElectionManagerUser({ electionHash }),
      buttonToPress: 'Reset Card PIN',
      expectedProgressText: 'Resetting card PIN',
      expectedErrorText:
        'Error resetting Election Manager card PIN. Please try again.',
    },
    {
      programmedUser: mockElectionManagerUser({ electionHash }),
      buttonToPress: 'Unprogram Card',
      expectedProgressText: 'Unprogramming card',
      expectedErrorText:
        'Error unprogramming Election Manager card. Please try again.',
    },
    {
      programmedUser: mockPollWorkerUser({ electionHash }),
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
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'ready', programmedUser },
    });

    const modal = await screen.findByRole('alertdialog');
    userEvent.click(within(modal).getByRole('button', { name: buttonToPress }));
    await screen.findByText(new RegExp(expectedProgressText));
    await within(modal).findByText(expectedErrorText);

    apiMock.setAuthStatus({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
      programmableCard: { status: 'no_card' },
    });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  }
});

test('Backwards card handling', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'card_error' },
  });
  await screen.findByText('Card is Backwards');

  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
