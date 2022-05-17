import React from 'react';
import { Precinct } from '@votingworks/types';

import { Screen, Main } from '@votingworks/ui';

import { EventTargetFunction } from '../config/types';

import { Button } from '../components/button';
import { ButtonList } from '../components/button_list';
import { Heading } from '../components/heading';
import { MainNav } from '../components/main_nav';
import { Prose } from '../components/prose';
import { Text } from '../components/text';

interface Props {
  countyName: string;
  lockScreen: () => void;
  precincts: readonly Precinct[];
  updatePrecinct: EventTargetFunction;
}

export function PrecinctsScreen({
  countyName,
  lockScreen,
  precincts,
  updatePrecinct,
}: Props): JSX.Element {
  return (
    <Screen flexDirection="column">
      <Main>
        <Heading>
          <Prose>
            <h1>
              Precincts{' '}
              <Text as="span" light>
                for {countyName}
              </Text>
            </h1>
          </Prose>
        </Heading>
        <ButtonList columns={2}>
          {precincts.map((p) => (
            <Button
              data-id={p.id}
              fullWidth
              key={p.id}
              onPress={updatePrecinct}
            >
              {p.name}
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
