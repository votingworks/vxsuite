import { fontSizeTheme, Prose } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import { Screen } from '../components/screen';
import { Main, MainChild } from '../components/main';
import { StatusFooter } from '../components/status_footer';

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 5px;
  margin-left: auto;
  height: 20vw;
`;

export function MachineLockedScreen(): JSX.Element {
  return (
    <Screen>
      <Main>
        <MainChild maxWidth={false} centerHorizontal centerVertical>
          <LockedImage src="locked.svg" alt="Locked Icon" />
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            <h1>Machine Locked</h1>
            <p>Insert an admin card to unlock.</p>
          </Prose>
        </MainChild>
      </Main>
      <StatusFooter />
    </Screen>
  );
}
