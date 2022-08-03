import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeAdminCard, makeSuperadminCard } from '@votingworks/test-utils';
import { ElectionDefinition } from '@votingworks/types';
import { MemoryCard } from '@votingworks/utils';

export async function authenticateWithAdminCard(
  card: MemoryCard,
  electionDefinition: ElectionDefinition
): Promise<void> {
  // Machine should be locked
  await screen.findByText('VxAdmin is Locked');
  card.insertCard(makeAdminCard(electionDefinition.electionHash, '123456'));
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

export async function authenticateWithSuperAdminCard(
  card: MemoryCard
): Promise<void> {
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
