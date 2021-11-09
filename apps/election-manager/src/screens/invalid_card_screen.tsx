import { fontSizeTheme, Main, MainChild, Prose } from '@votingworks/ui';
import React from 'react';
import { Screen } from '../components/screen';
import { StatusFooter } from '../components/status_footer';

export function InvalidCardScreen(): JSX.Element {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            <h1>Invalid Card</h1>
            <p>
              The inserted card is not valid to unlock this machine. Please
              insert a valid admin card.
            </p>
          </Prose>
        </MainChild>
      </Main>
      <StatusFooter />
    </Screen>
  );
}
