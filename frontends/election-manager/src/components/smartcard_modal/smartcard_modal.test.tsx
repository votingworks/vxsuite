import fetchMock from 'fetch-mock';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { AdminUser, AnyCardData, PollworkerUser } from '@votingworks/types';
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
import { areVvsg2AuthFlowsEnabled } from '../../config/features';
import { createMemoryStorageWith } from '../../../test/util/create_memory_storage_with';
import { generatePin } from './pins';
import { MachineConfig } from '../../config/types';
import { VxFiles } from '../../lib/converters';

jest.mock(
  '../../config/features',
  (): typeof import('../../config/features') => {
    return {
      ...jest.requireActual('../../config/features'),
      areVvsg2AuthFlowsEnabled: jest.fn(),
    };
  }
);
jest.mock('./pins', (): typeof import('./pins') => {
  return {
    ...jest.requireActual('./pins'),
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

  mockOf(areVvsg2AuthFlowsEnabled).mockImplementation(() => true);
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
    expectedRoleString: string;
    expectedElectionString: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
    shouldUnprogramCardButtonBeDisplayed: boolean;
  }> = [
    {
      cardData: makeSuperadminCard(),
      expectedRoleString: 'Super Admin',
      expectedElectionString: 'N/A',
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: false,
    },
    {
      cardData: makeAdminCard(electionHash),
      expectedRoleString: 'Admin',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: true,
      shouldUnprogramCardButtonBeDisplayed: true,
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedRoleString: 'Poll Worker',
      expectedElectionString: 'General Election — Tuesday, November 3, 2020',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
    },
    {
      cardData: makeVoterCard(election),
      expectedRoleString: 'Voter',
      expectedElectionString: 'Unknown',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: false,
    },
    {
      cardData: makeAdminCard(otherElectionHash),
      expectedRoleString: 'Admin',
      expectedElectionString: 'Unknown',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
    },
    {
      cardData: makePollWorkerCard(otherElectionHash),
      expectedRoleString: 'Poll Worker',
      expectedElectionString: 'Unknown',
      shouldResetCardPinButtonBeDisplayed: false,
      shouldUnprogramCardButtonBeDisplayed: true,
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const {
      cardData,
      expectedRoleString,
      expectedElectionString,
      shouldResetCardPinButtonBeDisplayed,
      shouldUnprogramCardButtonBeDisplayed,
    } = testCase;

    card.insertCard(cardData);
    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Card Details' });
    within(modal).getByText(expectedRoleString);
    within(modal).getByText(expectedElectionString);
    within(modal).getByText('Remove card to leave this screen.');
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
    expectedRoleString: string;
    expectedElectionString: string;
    shouldResetCardPinButtonBeDisplayed: boolean;
  }> = [
    {
      cardData: makeSuperadminCard(),
      expectedRoleString: 'Super Admin',
      expectedElectionString: 'N/A',
      shouldResetCardPinButtonBeDisplayed: true,
    },
    {
      cardData: makeAdminCard(electionHash),
      expectedRoleString: 'Admin',
      expectedElectionString: 'Unknown',
      shouldResetCardPinButtonBeDisplayed: false,
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedRoleString: 'Poll Worker',
      expectedElectionString: 'Unknown',
      shouldResetCardPinButtonBeDisplayed: false,
    },
    {
      cardData: makeVoterCard(election),
      expectedRoleString: 'Voter',
      expectedElectionString: 'Unknown',
      shouldResetCardPinButtonBeDisplayed: false,
    },
  ];

  await screen.findByRole('heading', { name: 'Configure VxAdmin' });

  for (const testCase of testCases) {
    const {
      cardData,
      expectedRoleString,
      expectedElectionString,
      shouldResetCardPinButtonBeDisplayed,
    } = testCase;

    card.insertCard(cardData);
    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Card Details' });
    within(modal).getByText(expectedRoleString);
    within(modal).getByText(expectedElectionString);
    within(modal).getByText('Remove card to leave this screen.');
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
    expectedSuccessText: string;
    shouldCardHavePin: boolean;
    expectedRoleString: string;
    expectedCardLongString?: string;
  }> = [
    {
      role: 'admin',
      expectedProgressText: 'Programming Admin card',
      expectedSuccessText: 'New Admin card has been programmed.',
      shouldCardHavePin: true,
      expectedRoleString: 'Admin',
      expectedCardLongString: electionData,
    },
    {
      role: 'pollworker',
      expectedProgressText: 'Programming Poll Worker card',
      expectedSuccessText: 'New Poll Worker card has been programmed.',
      shouldCardHavePin: false,
      expectedRoleString: 'Poll Worker',
      expectedCardLongString: undefined,
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const {
      role,
      expectedProgressText,
      expectedSuccessText,
      shouldCardHavePin,
      expectedRoleString,
      expectedCardLongString,
    } = testCase;

    card.insertCard(); // Blank card
    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Program Election Card' });
    within(modal).getByText(
      'Admin and Poll Worker cards only work for the current election.'
    );
    within(modal).getByText('Remove card to leave card unprogrammed.');
    const programAdminCardButton = within(modal).getByRole('button', {
      name: 'Program Admin Card',
    });
    const programPollWorkerCardButton = within(modal).getByRole('button', {
      name: 'Program Poll Worker Card',
    });
    switch (role) {
      case 'admin': {
        userEvent.click(programAdminCardButton);
        break;
      }
      case 'pollworker': {
        userEvent.click(programPollWorkerCardButton);
        break;
      }
      default: {
        throwIllegalValue(role);
      }
    }
    await screen.findByText(new RegExp(expectedProgressText));
    await within(modal).findByRole('heading', { name: 'Card Details' });
    within(modal).getByText(new RegExp(expectedSuccessText));
    if (shouldCardHavePin) {
      within(modal).getByText(/The card PIN is 123-456. Write this PIN down./);
    }
    within(modal).getByText(expectedRoleString);
    within(modal).getByText('General Election — Tuesday, November 3, 2020');
    within(modal).getByText('Remove card to leave this screen.');
    if (shouldCardHavePin) {
      // PIN resetting is disabled right after a card has been created
      expect(
        within(modal).getByRole('button', { name: 'Reset Card PIN' })
      ).toHaveAttribute('disabled');
    } else {
      expect(
        within(modal).queryByRole('button', { name: 'Reset Card PIN' })
      ).not.toBeInTheDocument();
    }
    within(modal).getByRole('button', { name: 'Unprogram Card' });
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
  within(modal).getByRole('heading', { name: 'Program Super Admin Card' });
  within(modal).getByText(
    'This card performs all system actions. ' +
      'Strictly limit the number created and keep all Super Admin cards secure.'
  );
  within(modal).getByText('Remove card to leave card unprogrammed.');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Program Super Admin Card' })
  );
  await screen.findByText(/Programming Super Admin card/);
  await within(modal).findByRole('heading', { name: 'Card Details' });
  within(modal).getByText(/New Super Admin card has been programmed./);
  within(modal).getByText('Super Admin');
  within(modal).getByText('N/A'); // Card election
  within(modal).getByText('Remove card to leave this screen.');
  // PIN resetting is disabled right after a card has been created
  expect(
    within(modal).getByRole('button', { name: 'Reset Card PIN' })
  ).toHaveAttribute('disabled');
  expect(
    within(modal).queryByRole('button', { name: 'Unprogram Card' })
  ).not.toBeInTheDocument();
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
  within(modal).getByRole('heading', { name: 'Program Election Card' });
  within(modal).getByText(
    'An election must be defined before Admin and Poll Worker cards can be programmed.'
  );
  within(modal).getByText('Remove card to leave card unprogrammed.');
  expect(
    within(modal).getByRole('button', { name: 'Program Admin Card' })
  ).toHaveAttribute('disabled');
  expect(
    within(modal).getByRole('button', { name: 'Program Poll Worker Card' })
  ).toHaveAttribute('disabled');
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
    expectedProgressText: string;
    expectedSuccessText: string;
  }> = [
    {
      cardData: makeSuperadminCard(oldPin),
      cardLongValue: undefined,
      expectedProgressText: 'Resetting Super Admin card PIN',
      expectedSuccessText: 'Super Admin card PIN has been reset.',
    },
    {
      cardData: makeAdminCard(electionHash, oldPin),
      cardLongValue: electionData,
      expectedProgressText: 'Resetting Admin card PIN',
      expectedSuccessText: 'Admin card PIN has been reset.',
    },
  ];

  // The smartcard modal should open on any screen, not just the Smartcards screen
  await screen.findByRole('heading', { name: 'Election Definition' });

  for (const testCase of testCases) {
    const {
      cardData,
      cardLongValue,
      expectedProgressText,
      expectedSuccessText,
    } = testCase;

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
    within(modal).getByRole('heading', { name: 'Card Details' });
    userEvent.click(
      within(modal).getByRole('button', { name: 'Reset Card PIN' })
    );
    await screen.findByText(new RegExp(expectedProgressText));
    await within(modal).findByText(new RegExp(expectedSuccessText));
    await within(modal).findByText(
      /The new PIN is 123-456. Write this PIN down./
    );

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
    expectedConfirmationText: string;
    expectedSuccessText: string;
  }> = [
    {
      cardData: makeAdminCard(electionHash),
      expectedConfirmationText:
        'Are you sure you want to unprogram this Admin card and delete all data on it?',
      expectedSuccessText: 'Admin card has been unprogrammed.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      expectedConfirmationText:
        'Are you sure you want to unprogram this Poll Worker card and delete all data on it?',
      expectedSuccessText: 'Poll Worker card has been unprogrammed.',
    },
  ];

  for (const testCase of testCases) {
    const { cardData, expectedConfirmationText, expectedSuccessText } =
      testCase;

    card.insertCard(cardData);
    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Card Details' });

    // Cancel the first time
    userEvent.click(
      within(modal).getByRole('button', { name: 'Unprogram Card' })
    );
    let confirmationModal: HTMLElement = (
      await screen.findByRole('heading', { name: 'Unprogram Card' })
    ).closest('[role="alertdialog"]')!;
    await within(confirmationModal).findByText(expectedConfirmationText);
    userEvent.click(
      within(confirmationModal).getByRole('button', { name: 'Cancel' })
    );
    await waitFor(() => expect(confirmationModal).not.toBeInTheDocument());

    // Go through with it the second time
    userEvent.click(
      within(modal).getByRole('button', { name: 'Unprogram Card' })
    );
    confirmationModal = (
      await screen.findByRole('heading', { name: 'Unprogram Card' })
    ).closest('[role="alertdialog"]')!;
    await within(confirmationModal).findByText(expectedConfirmationText);
    userEvent.click(
      within(confirmationModal).getByRole('button', { name: 'Yes' })
    );
    await within(confirmationModal).findByText(/Deleting all data on card/);
    await waitFor(() => expect(confirmationModal).not.toBeInTheDocument());
    await within(modal).findByRole('heading', {
      name: 'Program Election Card',
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
    confirmButtonToPress?: string;
    expectedProgressText: string;
    expectedErrorText: string;
  }> = [
    {
      cardData: undefined,
      buttonToPress: 'Program Admin Card',
      expectedProgressText: 'Programming Admin card',
      expectedErrorText: 'Error programming Admin card. Please try again.',
    },
    {
      cardData: undefined,
      buttonToPress: 'Program Poll Worker Card',
      expectedProgressText: 'Programming Poll Worker card',
      expectedErrorText:
        'Error programming Poll Worker card. Please try again.',
    },
    {
      beginFromSuperAdminCardsScreen: true,
      cardData: undefined,
      buttonToPress: 'Program Super Admin Card',
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
      confirmButtonToPress: 'Yes',
      expectedProgressText: 'Deleting all data on card',
      expectedErrorText: 'Error unprogramming Admin card. Please try again.',
    },
    {
      cardData: makePollWorkerCard(electionHash),
      buttonToPress: 'Unprogram Card',
      confirmButtonToPress: 'Yes',
      expectedProgressText: 'Deleting all data on card',
      expectedErrorText:
        'Error unprogramming Poll Worker card. Please try again.',
    },
  ];

  for (const testCase of testCases) {
    const {
      beginFromSuperAdminCardsScreen,
      cardData,
      buttonToPress,
      confirmButtonToPress,
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
    if (confirmButtonToPress) {
      userEvent.click(
        await screen.findByRole('button', { name: confirmButtonToPress })
      );
    }
    await screen.findByText(new RegExp(expectedProgressText));
    await within(modal).findByText(expectedErrorText);
    card.removeCard();
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  }
});
