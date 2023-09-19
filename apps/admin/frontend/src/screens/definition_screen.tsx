import React, { useContext, useState } from 'react';
import styled from 'styled-components';

import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';

import { Button, Font, H3, Icons, LinkButton, P, Seal } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';

import { NavigationScreen } from '../components/navigation_screen';
import { RemoveElectionModal } from '../components/remove_election_modal';

const ButtonList = styled.div`
  display: flex;
  gap: 0.5rem;
`;

export function DefinitionScreen(): JSX.Element {
  const { electionDefinition, configuredAt } = useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;

  const [isRemovingElection, setIsRemovingElection] = useState(false);

  return (
    <React.Fragment>
      <NavigationScreen title="Election Definition">
        <P>
          Configured with the current election at{' '}
          <Font weight="bold">
            {format.localeLongDateAndTime(new Date(configuredAt))}
          </Font>
        </P>
        <H3 as="h2">Election Metadata</H3>
        <P>
          <Font weight="semiBold">Title:</Font> {election.title}
        </P>
        <P>
          <Font weight="semiBold">Date:</Font>{' '}
          {format.localeLongDateAndTime(new Date(election.date))}
        </P>
        <P>
          <Font weight="semiBold">County Name:</Font> {election.county.name}
        </P>
        <P>
          <Font weight="semiBold">State:</Font> {election.state}
        </P>
        <div>
          <Font weight="semiBold">Seal:</Font> <Seal seal={election.seal} />
        </div>
        <H3 as="h2">Advanced Features</H3>
        <ButtonList>
          <LinkButton to={routerPaths.definitionViewer}>
            View Definition JSON
          </LinkButton>
          <Button onPress={() => setIsRemovingElection(true)}>
            <Icons.Delete /> Remove Election
          </Button>
        </ButtonList>
      </NavigationScreen>
      {isRemovingElection && (
        <RemoveElectionModal onClose={() => setIsRemovingElection(false)} />
      )}
    </React.Fragment>
  );
}
