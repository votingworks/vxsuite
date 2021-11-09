import React from 'react';
import styled from 'styled-components';
import { BallotStyleId } from '@votingworks/types';

import { Prose } from '../components/prose';
import { Main, MainChild } from '../components/main';
import { MainNav } from '../components/main_nav';
import { Screen } from '../components/screen';
import { Button } from '../components/button';

const RemoveCardImage = styled.img`
  margin: 0 auto -1.75rem;
  height: 40vw;
`;

interface Props {
  ballotStyleId: BallotStyleId;
  lockScreen: () => void;
  precinctName: string;
}

export function RemoveCardScreen({
  ballotStyleId,
  lockScreen,
  precinctName,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <RemoveCardImage
              src="/images/remove-card.svg"
              alt="Remove Card Diagram"
            />
            <h1>Hand Card to Voter</h1>
            <p>
              {precinctName} / {ballotStyleId}
            </p>
          </Prose>
        </MainChild>
      </Main>
      <MainNav>
        <Button small onPress={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  );
}
