import React from 'react';
import styled from 'styled-components';

import { Screen, Main, Text } from '@votingworks/ui';

import { BallotStyle, PartyId } from '@votingworks/types';
import { EventTargetFunction } from '../config/types';

import { Button } from '../components/button';
import { ButtonList } from '../components/button_list';
import { Heading } from '../components/heading';
import { MainNav } from '../components/main_nav';
import { Prose } from '../components/prose';

const ButtonContainer = styled.div`
  float: right;
`;

interface Props {
  isSinglePrecinctMode: boolean;
  lockScreen: () => void;
  partyId?: PartyId;
  precinctBallotStyles: readonly BallotStyle[];
  precinctName: string;
  programCard: EventTargetFunction;
  showPrecincts: () => void;
}

export function PrecinctBallotStylesScreen({
  isSinglePrecinctMode,
  lockScreen,
  partyId,
  precinctBallotStyles,
  precinctName,
  programCard,
  showPrecincts,
}: Props): JSX.Element {
  const ballotStyles = partyId
    ? precinctBallotStyles.filter((bs) => bs.partyId === partyId)
    : precinctBallotStyles;
  const ballotStylesColumns = ballotStyles.length > 4 ? 3 : 2;
  return (
    <Screen>
      <Main>
        <Heading>
          {!isSinglePrecinctMode && (
            <ButtonContainer>
              <Button small onPress={showPrecincts}>
                All Precincts
              </Button>
            </ButtonContainer>
          )}
          <Prose>
            <h1>
              Ballot Styles{' '}
              <Text as="span" light>
                for {precinctName}
              </Text>
            </h1>
          </Prose>
        </Heading>
        <ButtonList columns={ballotStylesColumns}>
          {ballotStyles.map((ballotStyle) => (
            <Button
              fullWidth
              data-ballot-style-id={ballotStyle.id}
              key={ballotStyle.id}
              onPress={programCard}
            >
              {ballotStyle.id}
            </Button>
          ))}
        </ButtonList>
      </Main>
      <MainNav>
        <Button small onPress={lockScreen}>
          Lock
        </Button>
      </MainNav>
    </Screen>
  );
}
