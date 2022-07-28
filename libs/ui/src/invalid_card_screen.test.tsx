import React from 'react';
import { render, screen } from '@testing-library/react';

import { InvalidCardScreen, Props } from './invalid_card_screen';

const testCases: Array<{
  description: string;
  machine: Props['machine'];
  reason: Props['reason'];
  expectedText: string;
}> = [
  {
    description: 'VxAdmin not configured',
    machine: 'VxAdmin',
    reason: 'machine_not_configured',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.',
  },
  {
    description: 'VxCentralScan not configured',
    machine: 'VxCentralScan',
    reason: 'machine_not_configured',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert an Election Manager card.',
  },
  {
    description:
      'Election Manager card election hash does not match VxAdmin election hash',
    machine: 'VxAdmin',
    reason: 'admin_wrong_election',
    expectedText:
      'The inserted Election Manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
  {
    description:
      'Election Manager card election hash does not match VxCentralScan election hash',
    machine: 'VxCentralScan',
    reason: 'admin_wrong_election',
    expectedText:
      'The inserted Election Manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
  {
    description: 'other error on VxAdmin',
    machine: 'VxAdmin',
    reason: 'invalid_user_on_card',
    expectedText:
      'The inserted card is not valid to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
  {
    description: 'other error on VxCentralScan',
    machine: 'VxCentralScan',
    reason: 'invalid_user_on_card',
    expectedText:
      'The inserted card is not valid to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.',
  },
];

test.each(testCases)(
  'InvalidCardScreen renders expected text ($description)',
  ({ machine, reason, expectedText }) => {
    render(<InvalidCardScreen machine={machine} reason={reason} />);

    screen.getByText(expectedText);
  }
);
