import React from 'react';
import styled from 'styled-components';
import { Screen } from './screen';
import { Main } from './main';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';

const RemoveCardImage = styled.img`
  margin: 0 auto -1rem;
  height: 30vw;
`;

export function RemoveCardScreen(): JSX.Element {
  return (
    <Screen white>
      <Main centerChild>
        <Prose textCenter theme={fontSizeTheme.medium}>
          <RemoveCardImage aria-hidden src="assets/remove-card.svg" alt="" />
          <h1>Successful Authentication</h1>
          <p>Remove card to continue.</p>
        </Prose>
      </Main>
    </Screen>
  );
}
