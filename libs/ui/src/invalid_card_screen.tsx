import React from 'react';
import { Screen } from './screen';
import { Main } from './main';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';

export function InvalidCardScreen(): JSX.Element {
  return (
    <Screen white>
      <Main centerChild>
        <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
          <h1>Invalid Card</h1>
          <p>
            The inserted card is not valid to unlock this machine. Please insert
            a valid admin card.
          </p>
        </Prose>
      </Main>
    </Screen>
  );
}
