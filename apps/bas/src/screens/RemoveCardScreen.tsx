import React from 'react';
import styled from 'styled-components';
import { BallotStyleId } from '@votingworks/types';

import Prose from '../components/Prose';
import Main, { MainChild } from '../components/Main';
import MainNav from '../components/MainNav';
import Screen from '../components/Screen';
import Button from '../components/Button';

const RemoveCardImage = styled.img`
  margin: 0 auto -1.75rem;
  height: 40vw;
`;

interface Props {
  ballotStyleId: BallotStyleId;
  lockScreen: () => void;
  precinctName: string;
}

function RemoveCardScreen({
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

export default RemoveCardScreen;
