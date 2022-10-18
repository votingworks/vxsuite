import fetchMock from 'fetch-mock';
import React from 'react';
import userEvent from '@testing-library/user-event';
import {
  ElectionManagerUser,
  AnyCardData,
  PollWorkerUser,
} from '@votingworks/types';
import {
  assert,
  generatePin,
  MemoryCard,
  MemoryHardware,
  throwIllegalValue,
  typedAs,
} from '@votingworks/utils';
import {
  electionSampleDefinition,
  electionSample2Definition,
} from '@votingworks/fixtures';
import {
  makeElectionManagerCard,
  makePollWorkerCard,
  makeSystemAdministratorCard,
  makeVoterCard,
  mockOf,
} from '@votingworks/test-utils';
import { screen, waitFor, within } from '@testing-library/react';

import { App } from '../../app';
import { authenticateWithSystemAdministratorCard } from '../../../test/util/authenticate';
import { MachineConfig } from '../../config/types';
import { VxFiles } from '../../lib/converters';
import { renderRootElement } from '../../../test/render_in_app_context';
import { ElectionManagerStoreMemoryBackend } from '../../lib/backends';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    generatePin: jest.fn(),
  };
});

const electionDefinition = electionSampleDefinition;
const { election, electionData, electionHash } = electionDefinition;
const otherElectionHash = electionSample2Definition.electionHash;

beforeEach(() => {
  fetchMock.reset();
  fetchMock.get(
    '/convert/election/files',
    typedAs<VxFiles>({ inputFiles: [], outputFiles: [] })
  );
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfig>({ codeVersion: '', machineId: '' })
  );

  mockOf(generatePin).mockImplementation(() => '123456');
});

test('Smartcard modal displays card details', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  const testCases: Array<{
    cardData: AnyCardData;
    expectedHeading: string;
    expectedElectionString?: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
    shouldUnprogramCardButtonBeDisplayed: boolean;
    expectedFooter: string;
  }> = [
    {
      cardData: makeSystemAdministratorCard(),
      expectedHeading: 'System Administrator Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: false,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      cardData: makeElectionManagerCard(electionHash),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      cardData: makeVoterCard(election),
      expectedHeading: 'Voter Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: false,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      cardData: makeElectionManagerCard(otherElectionHash),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      cardData: makePollWorkerCard(otherElectionHash),
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
      cardData,
      expectedHeading,
      expectedElectionString,
      shouldResetCardPinButtonBeDisplayed,
      shouldUnprogramCardButtonBeDisplayed,
      expectedFooter,
    } = testCase;

    card.insertCard(cardData);

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

    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    await screen.findByRole('heading', { name: 'Election Definition' });
  }
});

test('Smartcard modal displays card details when no election definition on machine', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend();
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  const testCases: Array<{
    cardData: AnyCardData;
    expectedHeading: string;
    expectedElectionString?: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
    shouldElectionDefinitionPromptBeDisplayed: boolean;
    expectedFooter: string;
  }> = [
    {
      cardData: makeSystemAdministratorCard(),
      expectedHeading: 'System Administrator Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      shouldElectionDefinitionPromptBeDisplayed: false,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      cardData: makeElectionManagerCard(electionHash),
      expectedHeading: 'Election Manager Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      cardData: makeVoterCard(election),
      expectedHeading: 'Voter Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldElectionDefinitionPromptBeDisplayed: true,
      expectedFooter: 'Remove card to leave this screen.',
    },
  ];

  await screen.findByRole('heading', { name: 'Configure VxAdmin' });

  for (const testCase of testCases) {
    const {
      cardData,
      expectedHeading,
      expectedElectionString,
      shouldResetCardPinButtonBeDisplayed,
      shouldElectionDefinitionPromptBeDisplayed,
      expectedFooter,
    } = testCase;

    card.insertCard(cardData);

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

    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  }
});

test('Programming election manager and poll worker smartcards', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  const testCases: Array<{
    role: ElectionManagerUser['role'] | PollWorkerUser['role'];
    expectedHeadingAfterProgramming: string;
    expectedSuccessText: Array<string | RegExp>;
    expectedCardLongString?: string;
  }> = [
    {
      role: 'election_manager',
      expectedHeadingAfterProgramming: 'Election Manager Card',
      expectedSuccessText: [/New card PIN is /, '123-456'],
      expectedCardLongString: electionData,
    },
    {
      role: 'poll_worker',
      expectedHeadingAfterProgramming: 'Poll Worker Card',
      expectedSuccessText: ['New card created.'],
      expectedCardLongString: undefined,
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const {
      role,
      expectedHeadingAfterProgramming,
      expectedSuccessText,
      expectedCardLongString,
    } = testCase;

    card.insertCard(); // Blank card

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
    await within(modal).findByRole('heading', {
      name: expectedHeadingAfterProgramming,
    });
    within(modal).getByText('General Election — Tuesday, November 3, 2020');
    for (const text of expectedSuccessText) {
      within(modal).getByText(text);
    }
    within(modal).getByText('Remove card to continue.');
    expect(await card.readLongString()).toEqual(expectedCardLongString);

    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, finding by role doesn't work here, though 'Election Definition' is present
    // in a heading
    await screen.findByText('Election Definition');
  }
});

test('Programming system administrator smartcards', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  // Programming system administrator smartcards requires being on a specific screen
  userEvent.click(await screen.findByText('Smartcards'));
  userEvent.click(await screen.findByText('Create System Administrator Cards'));
  await screen.findByRole('heading', { name: 'System Administrator Cards' });
  card.insertCard(); // Blank card

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
  userEvent.click(systemAdministratorCardButton);
  await screen.findByText(/Programming card/);
  await within(modal).findByRole('heading', {
    name: 'System Administrator Card',
  });
  within(modal).getByText(/New card PIN is /);
  within(modal).getByText('123-456');
  within(modal).getByText('Remove card to continue.');

  card.removeCard();
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  // For some reason, finding by role doesn't work here, though 'System Administrator Cards' is
  // present in a heading
  await screen.findByText('System Administrator Cards');
});

test('Programming smartcards when no election definition on machine', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend();
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  card.insertCard(); // Blank card

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

  card.removeCard();
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
});

test('Resetting smartcard PINs', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  const oldPin = '000000';
  const newPin = '123456';
  mockOf(generatePin).mockImplementation(() => newPin);

  const testCases: Array<{
    cardData: AnyCardData;
    cardLongValue?: string;
    expectedHeading: string;
  }> = [
    {
      cardData: makeSystemAdministratorCard(oldPin),
      cardLongValue: undefined,
      expectedHeading: 'System Administrator Card',
    },
    {
      cardData: makeElectionManagerCard(electionHash, oldPin),
      cardLongValue: electionData,
      expectedHeading: 'Election Manager Card',
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const { cardData, cardLongValue, expectedHeading } = testCase;

    card.insertCard(cardData);
    if (cardLongValue) {
      await card.writeLongUint8Array(new TextEncoder().encode(cardLongValue));
    }
    const summaryBefore = await card.readSummary();
    const shortValueBefore =
      summaryBefore.status === 'ready' ? summaryBefore.shortValue : undefined;
    const longValueBefore = await card.readLongString();
    expect(shortValueBefore).toContain(oldPin);
    assert(shortValueBefore !== undefined);
    expect(longValueBefore).toEqual(cardLongValue);

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: expectedHeading });
    userEvent.click(
      within(modal).getByRole('button', { name: 'Reset Card PIN' })
    );
    await screen.findByText(/Resetting card PIN/);
    await within(modal).findByText(/New card PIN is /);
    await within(modal).findByText('123-456');
    within(modal).getByText('Remove card to continue.');

    // Verify that the card PIN and nothing else was changed under the hood
    const summaryAfter = await card.readSummary();
    const shortValueAfter =
      summaryAfter.status === 'ready' ? summaryAfter.shortValue : undefined;
    const longValueAfter = await card.readLongString();
    expect(shortValueAfter).toEqual(shortValueBefore.replace(oldPin, newPin));
    expect(longValueAfter).toEqual(longValueBefore);

    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, finding by role doesn't work here, though 'Election Definition' is present
    // in a heading
    await screen.findByText('Election Definition');
  }
});

test('Resetting system administrator smartcard PINs when no election definition on machine', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend();
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  const oldPin = '000000';
  const newPin = '123456';
  mockOf(generatePin).mockImplementation(() => newPin);

  await screen.findByRole('heading', { name: 'Configure VxAdmin' });

  card.insertCard(makeSystemAdministratorCard(oldPin));
  const summaryBefore = await card.readSummary();
  const shortValueBefore =
    summaryBefore.status === 'ready' ? summaryBefore.shortValue : undefined;
  expect(shortValueBefore).toContain(oldPin);
  assert(shortValueBefore !== undefined);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'System Administrator Card' });
  userEvent.click(
    within(modal).getByRole('button', { name: 'Reset Card PIN' })
  );
  await screen.findByText(/Resetting card PIN/);
  await within(modal).findByText(/New card PIN is /);
  await within(modal).findByText('123-456');
  within(modal).getByText('Remove card to continue.');

  // Verify that the card PIN and nothing else was changed under the hood
  const summaryAfter = await card.readSummary();
  const shortValueAfter =
    summaryAfter.status === 'ready' ? summaryAfter.shortValue : undefined;
  expect(shortValueAfter).toEqual(shortValueBefore.replace(oldPin, newPin));

  card.removeCard();
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  // For some reason, finding by role doesn't work here, though 'Configure VxAdmin' is present in a
  // heading
  await screen.findByText('Configure VxAdmin');
});

test('Unprogramming smartcards', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  const testCases: Array<{
    cardData: AnyCardData;
    expectedHeadingBeforeUnprogramming: string;
    expectedSuccessText: string;
  }> = [
    {
      cardData: makeElectionManagerCard(electionHash),
      expectedHeadingBeforeUnprogramming: 'Election Manager Card',
      expectedSuccessText: 'Election Manager card has been unprogrammed.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedHeadingBeforeUnprogramming: 'Poll Worker Card',
      expectedSuccessText: 'Poll Worker card has been unprogrammed.',
    },
  ];

  for (const testCase of testCases) {
    const {
      cardData,
      expectedHeadingBeforeUnprogramming,
      expectedSuccessText,
    } = testCase;

    card.insertCard(cardData);

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', {
      name: expectedHeadingBeforeUnprogramming,
    });
    userEvent.click(
      within(modal).getByRole('button', { name: 'Unprogram Card' })
    );
    await screen.findByText(/Unprogramming card/);
    await within(modal).findByRole('heading', {
      name: 'Create New Election Card',
    });
    within(modal).getByText(expectedSuccessText);

    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    // For some reason, finding by role doesn't work here, though 'Election Definition' is present
    // in a heading
    await screen.findByText('Election Definition');
  }
});

test('Error handling', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  card.overrideWriteProtection = jest.fn();
  mockOf(card.overrideWriteProtection).mockImplementation(() =>
    Promise.reject(new Error('Whoa!'))
  );

  const testCases: Array<{
    beginFromSuperAdminCardsScreen?: boolean;
    cardData?: AnyCardData;
    buttonToPress: string;
    expectedProgressText: string;
    expectedErrorText: string;
  }> = [
    {
      cardData: undefined,
      buttonToPress: 'Election Manager Card',
      expectedProgressText: 'Programming card',
      expectedErrorText:
        'Error creating Election Manager card. Please try again.',
    },
    {
      cardData: undefined,
      buttonToPress: 'Poll Worker Card',
      expectedProgressText: 'Programming card',
      expectedErrorText: 'Error creating Poll Worker card. Please try again.',
    },
    {
      beginFromSuperAdminCardsScreen: true,
      cardData: undefined,
      buttonToPress: 'Create System Administrator Card',
      expectedProgressText: 'Programming card',
      expectedErrorText:
        'Error creating System Administrator card. Please try again.',
    },
    {
      cardData: makeElectionManagerCard(electionHash),
      buttonToPress: 'Reset Card PIN',
      expectedProgressText: 'Resetting card PIN',
      expectedErrorText:
        'Error resetting Election Manager card PIN. Please try again.',
    },
    {
      cardData: makeElectionManagerCard(electionHash),
      buttonToPress: 'Unprogram Card',
      expectedProgressText: 'Unprogramming card',
      expectedErrorText:
        'Error unprogramming Election Manager card. Please try again.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      buttonToPress: 'Unprogram Card',
      expectedProgressText: 'Unprogramming card',
      expectedErrorText:
        'Error unprogramming Poll Worker card. Please try again.',
    },
  ];

  for (const testCase of testCases) {
    const {
      beginFromSuperAdminCardsScreen,
      cardData,
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
    card.insertCard(cardData);

    const modal = await screen.findByRole('alertdialog');
    userEvent.click(within(modal).getByRole('button', { name: buttonToPress }));
    await screen.findByText(new RegExp(expectedProgressText));
    await within(modal).findByText(expectedErrorText);

    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  }
});

test('Card inserted backwards is handled with message', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  renderRootElement(<App card={card} hardware={hardware} />, { backend });
  await authenticateWithSystemAdministratorCard(card);

  card.insertCard(undefined, undefined, 'error');
  await screen.findByText('Card is Backwards');

  card.removeCard();
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
