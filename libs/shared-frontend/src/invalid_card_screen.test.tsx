import React from 'react';
import { render, screen } from '@testing-library/react';

import { InvalidCardScreen, Props } from './invalid_card_screen';

const testCases: Array<{
  description: string;
  reason: Props['reason'];
  recommendedAction?: string;
  expectedHeading: string;
  expectedText: string;
}> = [
  {
    description: 'card is backwards',
    reason: 'card_error',
    expectedHeading: 'Card is Backwards',
    expectedText: 'Remove the card, turn it around, and insert it again.',
  },
  {
    description:
      'election manager card election hash does not match machine election hash',
    reason: 'election_manager_wrong_election',
    expectedHeading: 'Invalid Card',
    expectedText:
      'The inserted Election Manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
  {
    description: 'machine not configured',
    reason: 'machine_not_configured',
    expectedHeading: 'Invalid Card',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
  {
    description: 'machine not configured, custom recommended action',
    reason: 'machine_not_configured',
    recommendedAction: 'Please insert a System Administrator card.',
    expectedHeading: 'Invalid Card',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.',
  },
  {
    description: 'other error',
    reason: 'invalid_user_on_card',
    expectedHeading: 'Invalid Card',
    expectedText:
      'Please insert a valid Election Manager or System Administrator card.',
  },
];

test.each(testCases)(
  'InvalidCardScreen renders expected text ($description)',
  ({ reason, recommendedAction, expectedHeading, expectedText }) => {
    render(
      <InvalidCardScreen
        reason={reason}
        recommendedAction={recommendedAction}
      />
    );

    screen.getByRole('heading', { name: expectedHeading });
    screen.getByText(expectedText);
  }
);
