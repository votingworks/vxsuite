import { render, screen } from '../test/react_testing_library';

import { InvalidCardScreen, Props } from './invalid_card_screen';

const testCases: Array<{
  description: string;
  reasonAndContext: Props['reasonAndContext'];
  recommendedAction?: string;
  expectedHeading: string;
  expectedText: string;
}> = [
  {
    description: 'Card Backward',
    reasonAndContext: {
      reason: 'card_error',
    },
    expectedHeading: 'Card Backward',
    expectedText: 'Remove the card, turn it around, and insert it again.',
  },
  {
    description:
      'election manager card election key does not match machine election',
    reasonAndContext: {
      reason: 'wrong_election',
      cardUserRole: 'election_manager',
    },
    expectedHeading: 'Invalid Card',
    expectedText:
      'The inserted election manager card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid card.',
  },
  {
    description:
      'poll worker card election key does not match machine election',
    reasonAndContext: {
      reason: 'wrong_election',
      cardUserRole: 'poll_worker',
    },
    expectedHeading: 'Invalid Card',
    expectedText:
      'The inserted poll worker card is programmed for another election and cannot be used to unlock this machine. ' +
      'Please insert a valid card.',
  },
  {
    description: 'machine not configured',
    reasonAndContext: {
      reason: 'machine_not_configured',
    },
    recommendedAction: 'Please insert a System Administrator card.',
    expectedHeading: 'Invalid Card',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.',
  },
  {
    description: 'machine not configured, custom recommended action',
    reasonAndContext: {
      reason: 'machine_not_configured',
    },
    recommendedAction: 'Please insert a System Administrator card.',
    expectedHeading: 'Invalid Card',
    expectedText:
      'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Please insert a System Administrator card.',
  },
  {
    description: 'card jurisdiction does not match machine jurisdiction',
    reasonAndContext: {
      reason: 'wrong_jurisdiction',
      cardJurisdiction: 'some-jurisdiction',
      machineJurisdiction: 'another-jurisdiction',
    },
    expectedHeading: 'Invalid Card',
    expectedText:
      'The inserted card’s jurisdiction (some-jurisdiction) does not match this machine’s jurisdiction (another-jurisdiction). ' +
      'Please insert a valid card.',
  },
  {
    description: 'other error',
    reasonAndContext: {
      reason: 'invalid_user_on_card',
    },
    expectedHeading: 'Invalid Card',
    expectedText: 'Please insert a valid card.',
  },
];

test.each(testCases)(
  'InvalidCardScreen renders expected text ($description)',
  ({ reasonAndContext, recommendedAction, expectedHeading, expectedText }) => {
    render(
      <InvalidCardScreen
        reasonAndContext={reasonAndContext}
        recommendedAction={recommendedAction}
      />
    );

    screen.getByRole('heading', { name: expectedHeading });
    screen.getByText(expectedText);
  }
);
