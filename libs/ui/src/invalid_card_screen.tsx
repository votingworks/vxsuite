import React from 'react';
import { DippedSmartcardAuth, InsertedSmartcardAuth } from '@votingworks/types';

import { fontSizeTheme } from './themes';
import { Main } from './main';
import { Prose } from './prose';
import { Screen } from './screen';

type LoggedOutReason =
  | DippedSmartcardAuth.LoggedOut['reason']
  | InsertedSmartcardAuth.LoggedOut['reason'];

export interface Props {
  // TODO: Update this component to support VxMark and VxScan, too
  machine: 'VxAdmin' | 'VxCentralScan';
  reason: LoggedOutReason;
}

export function InvalidCardScreen({ machine, reason }: Props): JSX.Element {
  let errorDescription: string;
  if (reason === 'machine_not_configured') {
    errorDescription =
      'This machine is unconfigured and cannot be unlocked with this card.';
  } else if (reason === 'admin_wrong_election') {
    errorDescription =
      'The inserted Election Manager card is programmed for another election ' +
      'and cannot be used to unlock this machine.';
  } else {
    errorDescription = 'The inserted card is not valid to unlock this machine.';
  }

  let recommendedAction: string;
  if (reason === 'machine_not_configured') {
    if (machine === 'VxAdmin') {
      recommendedAction = 'Please insert a System Administrator card.';
    } else {
      recommendedAction = 'Please insert an Election Manager card.';
    }
  } else {
    recommendedAction =
      'Please insert a valid Election Manager or System Administrator card.';
  }

  return (
    <Screen white>
      <Main centerChild padded>
        <Prose textCenter theme={fontSizeTheme.medium}>
          <h1>Invalid Card</h1>
          <p>
            {errorDescription} {recommendedAction}
          </p>
        </Prose>
      </Main>
    </Screen>
  );
}
