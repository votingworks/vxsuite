import React, { useContext, useState } from 'react';
import styled from 'styled-components';

import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';

import { Button, Font, H2, P, Seal } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { RemoveElectionModal } from '../components/remove_election_modal';

const ElectionMetadataContainer = styled.div`
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
  align-items: center;
  padding: 1rem;
  background: ${(p) => p.theme.colors.containerLow};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
`;

export function DefinitionScreen(): JSX.Element {
  const { electionDefinition, configuredAt } = useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;

  const [isRemovingElection, setIsRemovingElection] = useState(false);

  return (
    <React.Fragment>
      <NavigationScreen title="Election">
        <P>
          Configured with the current election at{' '}
          <Font weight="bold">
            {format.localeLongDateAndTime(new Date(configuredAt))}
          </Font>
        </P>
        <ElectionMetadataContainer>
          <Seal seal={election.seal} maxWidth="7rem" />
          <div>
            <H2 as="h3">{election.title}</H2>
            <P>
              {election.county.name}, {election.state}
              <br />
              {format.localeDate(new Date(election.date))}
            </P>
          </div>
        </ElectionMetadataContainer>
        <Button
          variant="danger"
          icon="Delete"
          onPress={() => setIsRemovingElection(true)}
        >
          Remove Election
        </Button>
      </NavigationScreen>
      {isRemovingElection && (
        <RemoveElectionModal onClose={() => setIsRemovingElection(false)} />
      )}
    </React.Fragment>
  );
}
