import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

import { Main } from './main';
import { Prose } from './prose';
import { RotateCardImage } from './rotate_card_image';
import { Screen } from './screen';
import { fontSizeTheme } from './themes';
import { H1, P } from './typography';

type ReasonAndContext = Pick<
  DippedSmartCardAuth.LoggedOut | InsertedSmartCardAuth.LoggedOut,
  'reason' | 'cardJurisdiction' | 'cardUserRole' | 'machineJurisdiction'
>;

export interface Props {
  reasonAndContext: ReasonAndContext;
  recommendedAction?: string;
}

export function InvalidCardScreen({
  reasonAndContext,
  recommendedAction: recommendedActionOverride,
}: Props): JSX.Element {
  const { cardJurisdiction, cardUserRole, machineJurisdiction, reason } =
    reasonAndContext;

  let graphic: JSX.Element | null = null;
  let heading = 'Invalid Card';
  let errorDescription = '';
  let recommendedAction =
    recommendedActionOverride ?? 'Please insert a valid card.';

  switch (reason) {
    case 'card_error': {
      graphic = <RotateCardImage />;
      // The only cause we currently know of for a card error
      heading = 'Card is Backwards';
      recommendedAction =
        'Remove the card, turn it around, and insert it again.';
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
            return 'Election Manager card';
          case 'poll_worker':
            return 'Poll Worker card';
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
      break;
    }
    default: {
      break;
    }
  }

  return (
    <Screen white>
      <Main centerChild padded>
        {graphic}
        <Prose textCenter themeDeprecated={fontSizeTheme.medium}>
          <H1>{heading}</H1>
          <P>
            {errorDescription} {recommendedAction}
          </P>
        </Prose>
      </Main>
    </Screen>
  );
}
