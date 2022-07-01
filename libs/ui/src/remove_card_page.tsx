import React from 'react';
import styled from 'styled-components';
import { Main } from './main';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';

const RemoveCardImage = styled.img`
  margin-right: auto;
  margin-bottom: 15px;
  margin-left: auto;
  height: 20vw;
`;

export function RemoveCardPage(): JSX.Element {
  return (
    <Main padded centerChild>
      <RemoveCardImage src="/assets/remove-card.svg" alt="Remove Card Icon" />
      <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
        <h1>Successfully Authenticated</h1>
        <p>Remove card.</p>
      </Prose>
    </Main>
  );
}
