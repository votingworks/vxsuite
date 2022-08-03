import fetchMock from 'fetch-mock';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { AdminUser, AnyCardData, PollworkerUser } from '@votingworks/types';
import { areVvsg2AuthFlowsEnabled } from '@votingworks/ui';
import {
  assert,
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
  throwIllegalValue,
  typedAs,
} from '@votingworks/utils';
import {
  electionSampleDefinition,
  electionSample2Definition,
} from '@votingworks/fixtures';
import {
  makeAdminCard,
  makePollWorkerCard,
  makeSuperadminCard,
  makeVoterCard,
  mockOf,
} from '@votingworks/test-utils';
import { render, screen, waitFor, within } from '@testing-library/react';

import { App } from '../../app';
import { createMemoryStorageWith } from '../../../test/util/create_memory_storage_with';
import { generatePin } from './pins';
import { MachineConfig } from '../../config/types';
import { VxFiles } from '../../lib/converters';

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  return {
    ...jest.requireActual('@votingworks/ui'),
    areVvsg2AuthFlowsEnabled: jest.fn(),
  };
});
jest.mock('./pins', (): typeof import('./pins') => {
  return {
    ...jest.requireActual('./pins'),
    generatePin: jest.fn(),
  };
});

function enableVvsg2AuthFlows() {
  mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => true);
  process.env['REACT_APP_VX_ENABLE_VVSG2_AUTH_FLOWS'] = 'true';
}

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

  enableVvsg2AuthFlows();
  mockOf(generatePin).mockImplementation(() => '123456');
});

async function authenticateWithSuperAdminCard(card: MemoryCard) {
  await screen.findByText('VxAdmin is Locked');
  card.insertCard(makeSuperadminCard());
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  await screen.findByText('Remove card to continue.');
  card.removeCard();
  await screen.findByText('Lock Machine');
}

test('Smartcard modal displays card details', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({ electionDefinition });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  const testCases: Array<{
    cardData: AnyCardData;
    expectedHeading: string;
    expectedElectionString?: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
    shouldUnprogramCardButtonBeDisplayed: boolean;
    expectedFooter: string;
  }> = [
    {
      cardData: makeSuperadminCard(),
      expectedHeading: 'Super Admin Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: false,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      cardData: makeAdminCard(electionHash),
      expectedHeading: 'Admin Card',
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
      cardData: makeAdminCard(otherElectionHash),
      expectedHeading: 'Admin Card',
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
  const storage = new MemoryStorage();
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  const testCases: Array<{
    cardData: AnyCardData;
    expectedHeading: string;
    expectedElectionString?: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
    expectedFooter: string;
  }> = [
    {
      cardData: makeSuperadminCard(),
      expectedHeading: 'Super Admin Card',
      expectedElectionString: undefined,
      shouldResetCardPinButtonBeDisplayed: true,
      expectedFooter: 'Remove card to cancel.',
    },
    {
      cardData: makeAdminCard(electionHash),
      expectedHeading: 'Admin Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedHeading: 'Poll Worker Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
      expectedFooter: 'Remove card to leave this screen.',
    },
    {
      cardData: makeVoterCard(election),
      expectedHeading: 'Voter Card',
      expectedElectionString: 'Unknown Election',
      shouldResetCardPinButtonBeDisplayed: false,
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
    within(modal).getByText(expectedFooter);

    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  }
});

test('Programming admin and poll worker smartcards', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({ electionDefinition });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  const testCases: Array<{
    role: AdminUser['role'] | PollworkerUser['role'];
    expectedProgressText: string;
    expectedHeadingAfterProgramming: string;
    expectedSuccessText: Array<string | RegExp>;
    expectedCardLongString?: string;
  }> = [
    {
      role: 'admin',
      expectedProgressText: 'Programming Admin card',
      expectedHeadingAfterProgramming: 'Admin Card',
      expectedSuccessText: [/New card PIN is /, '123-456'],
      expectedCardLongString: electionData,
    },
    {
      role: 'pollworker',
      expectedProgressText: 'Programming Poll Worker card',
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
      expectedProgressText,
      expectedHeadingAfterProgramming,
      expectedSuccessText,
      expectedCardLongString,
    } = testCase;

    card.insertCard(); // Blank card

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Create New Election Card' });
    within(modal).getByText('General Election — Tuesday, November 3, 2020');
    const adminCardButton = within(modal).getByRole('button', {
      name: 'Admin Card',
    });
    const pollWorkerCardButton = within(modal).getByRole('button', {
      name: 'Poll Worker Card',
    });
    within(modal).getByText('Remove card to cancel.');
    switch (role) {
      case 'admin': {
        userEvent.click(adminCardButton);
        break;
      }
      case 'pollworker': {
        userEvent.click(pollWorkerCardButton);
        break;
      }
      default: {
        throwIllegalValue(role);
      }
    }
    await screen.findByText(new RegExp(expectedProgressText));
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

test('Programming super admin smartcards', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({ electionDefinition });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  // Programming super admin smartcards requires being on a specific screen
  userEvent.click(screen.getByText('Smartcards'));
  userEvent.click(await screen.findByText('Create Super Admin Cards'));
  await screen.findByRole('heading', { name: 'Super Admin Cards' });
  card.insertCard(); // Blank card

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Create New Super Admin Card' });
  within(modal).getByText(
    'This card performs all system actions. ' +
      'Strictly limit the number created and keep all Super Admin cards secure.'
  );
  const superAdminCardButton = within(modal).getByRole('button', {
    name: 'Create Super Admin Card',
  });
  within(modal).getByText('Remove card to cancel.');
  userEvent.click(superAdminCardButton);
  await screen.findByText(/Programming Super Admin card/);
  await within(modal).findByRole('heading', { name: 'Super Admin Card' });
  within(modal).getByText(/New card PIN is /);
  within(modal).getByText('123-456');
  within(modal).getByText('Remove card to continue.');

  card.removeCard();
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  // For some reason, finding by role doesn't work here, though 'Super Admin Cards' is present in a
  // heading
  await screen.findByText('Super Admin Cards');
});

test('Programming smartcards when no election definition on machine', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  card.insertCard(); // Blank card

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Create New Election Card' });
  within(modal).getByText(
    'An election must be defined before Admin and Poll Worker cards can be programmed.'
  );
  expect(
    within(modal).queryByRole('button', { name: 'Admin Card' })
  ).not.toBeInTheDocument();
  expect(
    within(modal).queryByRole('button', { name: 'Poll Worker Card' })
  ).not.toBeInTheDocument();
  within(modal).getByText('Remove card to cancel.');

  card.removeCard();
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
});

test('Resetting smartcard PINs', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({ electionDefinition });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  const oldPin = '000000';
  const newPin = '123456';
  mockOf(generatePin).mockImplementation(() => newPin);

  const testCases: Array<{
    cardData: AnyCardData;
    cardLongValue?: string;
    expectedHeading: string;
    expectedProgressText: string;
  }> = [
    {
      cardData: makeSuperadminCard(oldPin),
      cardLongValue: undefined,
      expectedHeading: 'Super Admin Card',
      expectedProgressText: 'Resetting Super Admin card PIN',
    },
    {
      cardData: makeAdminCard(electionHash, oldPin),
      cardLongValue: electionData,
      expectedHeading: 'Admin Card',
      expectedProgressText: 'Resetting Admin card PIN',
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const { cardData, cardLongValue, expectedHeading, expectedProgressText } =
      testCase;

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
    await screen.findByText(new RegExp(expectedProgressText));
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

test('Unprogramming smartcards', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = await createMemoryStorageWith({ electionDefinition });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  const testCases: Array<{
    cardData: AnyCardData;
    expectedHeadingBeforeUnprogramming: string;
    expectedProgressText: string;
    expectedSuccessText: string;
  }> = [
    {
      cardData: makeAdminCard(electionHash),
      expectedHeadingBeforeUnprogramming: 'Admin Card',
      expectedProgressText: 'Unprogramming Admin card',
      expectedSuccessText: 'Admin card has been unprogrammed.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedHeadingBeforeUnprogramming: 'Poll Worker Card',
      expectedProgressText: 'Unprogramming Poll Worker card',
      expectedSuccessText: 'Poll Worker card has been unprogrammed.',
    },
  ];

  for (const testCase of testCases) {
    const {
      cardData,
      expectedHeadingBeforeUnprogramming,
      expectedProgressText,
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
    await screen.findByText(new RegExp(expectedProgressText));
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
  const storage = await createMemoryStorageWith({ electionDefinition });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await authenticateWithSuperAdminCard(card);

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
      buttonToPress: 'Admin Card',
      expectedProgressText: 'Programming Admin card',
      expectedErrorText: 'Error programming Admin card. Please try again.',
    },
    {
      cardData: undefined,
      buttonToPress: 'Poll Worker Card',
      expectedProgressText: 'Programming Poll Worker card',
      expectedErrorText:
        'Error programming Poll Worker card. Please try again.',
    },
    {
      beginFromSuperAdminCardsScreen: true,
      cardData: undefined,
      buttonToPress: 'Create Super Admin Card',
      expectedProgressText: 'Programming Super Admin card',
      expectedErrorText:
        'Error programming Super Admin card. Please try again.',
    },
    {
      cardData: makeAdminCard(electionHash),
      buttonToPress: 'Reset Card PIN',
      expectedProgressText: 'Resetting Admin card PIN',
      expectedErrorText: 'Error resetting Admin card PIN. Please try again.',
    },
    {
      cardData: makeAdminCard(electionHash),
      buttonToPress: 'Unprogram Card',
      expectedProgressText: 'Unprogramming Admin card',
      expectedErrorText: 'Error unprogramming Admin card. Please try again.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      buttonToPress: 'Unprogram Card',
      expectedProgressText: 'Unprogramming Poll Worker card',
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
      userEvent.click(await screen.findByText('Create Super Admin Cards'));
      await screen.findByText('Super Admin Cards');
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
