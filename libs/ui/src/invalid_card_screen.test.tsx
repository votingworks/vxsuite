import React from 'react';
import { render, screen } from '@testing-library/react';

import { InvalidCardScreen, Props } from './invalid_card_screen';

const testCases: Array<{
  description: string;
  reason: Props['reason'];
  recommendedAction?: string;
  expectedText: string;
}> = [
  {
    description: 'machine not configured',
    reason: 'machine_not_configured',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
  {
    description: 'machine not configured, custom recommended action',
    reason: 'machine_not_configured',
    recommendedAction: 'Please insert a System Administrator card.',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.',
  },
  {
    description:
      'election manager card election hash does not match machine election hash',
    reason: 'admin_wrong_election',
    expectedText:
      'The inserted Election Manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
  {
    description: 'other error',
    reason: 'invalid_user_on_card',
    expectedText:
      'Please insert a valid Election Manager or System Administrator card.',
  },
];

test.each(testCases)(
  'InvalidCardScreen renders expected text ($description)',
  ({ reason, recommendedAction, expectedText }) => {
    render(
      <InvalidCardScreen
        reason={reason}
        recommendedAction={recommendedAction}
      />
    );

    screen.getByText(expectedText);
  }
);
