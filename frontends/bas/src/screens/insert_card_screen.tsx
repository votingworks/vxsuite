import React from 'react';
import styled from 'styled-components';

import { Screen, Main } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { MainNav } from '../components/main_nav';
import { Button } from '../components/button';

const InsertCardImage = styled.img`
  margin: 0 auto -1.75rem;
  height: 40vw;
`;

interface Props {
  lockScreen: () => void;
}

export function InsertCardScreen({ lockScreen }: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <InsertCardImage
            src="/images/insert-card.svg"
            alt="Insert Card Diagram"
          />
          <h1>Insert a Voter Card</h1>
        </Prose>
      </Main>
      <MainNav>
        <Button small onPress={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  );
}
