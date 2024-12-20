import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

import { Main } from './main';
import { Screen } from './screen';
import { FullScreenIconWrapper, Icons } from './icons';
import { FullScreenMessage } from './full_screen_message';
import { H3 } from './typography';
import { CardInsertionDirection, RotateCardImage } from './smart_card_images';

type ReasonAndContext = Pick<
  DippedSmartCardAuth.LoggedOut | InsertedSmartCardAuth.LoggedOut,
  'reason' | 'cardJurisdiction' | 'cardUserRole' | 'machineJurisdiction'
>;

export interface Props {
  reasonAndContext: ReasonAndContext;
  recommendedAction?: string;
  cardInsertionDirection?: CardInsertionDirection;
}

export function InvalidCardScreen({
  reasonAndContext,
  recommendedAction: recommendedActionOverride,
  cardInsertionDirection,
}: Props): JSX.Element {
  const { cardJurisdiction, cardUserRole, machineJurisdiction, reason } =
    reasonAndContext;

  let graphic = (
    <FullScreenIconWrapper>
      <Icons.Warning color="warning" />
    </FullScreenIconWrapper>
  );
  let heading = 'Invalid Card';
  let errorDescription = '';
  let recommendedAction = recommendedActionOverride ?? 'Insert a valid card.';

  switch (reason) {
    case 'card_error': {
      graphic = (
        <RotateCardImage cardInsertionDirection={cardInsertionDirection} />
      );
      // We've also seen a faulty card reader trigger this case, but that seems to be a much rarer
      // case than the card being backwards.
      heading = 'Card Backward';
      recommendedAction =
        'Remove the card, turn it around, and insert it again.';
      break;
    }
    case 'certificate_expired': {
      errorDescription =
        'The card has expired, or one of your machines has an incorrect date.';
      recommendedAction =
        'Reprogram the card and check that your machines have the correct date and time.';
      break;
    }
    case 'certificate_not_yet_valid': {
      recommendedAction =
        'Check that the your machines have the correct date and time.';
      break;
    }
    case 'machine_not_configured': {
      errorDescription =
        'This machine is unconfigured and cannot be unlocked with this card.';
      break;
    }
    case 'wrong_election': {
      const cardString = (() => {
        switch (cardUserRole) {
          case 'election_manager':
            return 'election manager card';
          case 'poll_worker':
            return 'poll worker card';
          /* istanbul ignore next */
          default:
            return 'card';
        }
      })();
      errorDescription =
        `The inserted ${cardString} is programmed for another election ` +
        'and cannot be used to unlock this machine.';
      break;
    }
    case 'wrong_jurisdiction': {
      errorDescription =
        `The inserted card’s jurisdiction (${cardJurisdiction}) does not match ` +
        `this machine’s jurisdiction (${machineJurisdiction}).`;
      // If the card has the wrong jurisdiction, there's probably not an action for a
      // typical customer to take. The warning is mostly for our own testing and production.
      recommendedAction = '';
      break;
    }
    default: {
      break;
    }
  }

  return (
    <Screen>
      <Main centerChild padded>
        <FullScreenMessage title={heading} image={graphic}>
          <H3 style={{ fontWeight: 'normal' }}>
            {errorDescription} {recommendedAction}
          </H3>
        </FullScreenMessage>
      </Main>
    </Screen>
  );
}
