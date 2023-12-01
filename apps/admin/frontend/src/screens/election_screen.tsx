import React, { useContext, useState } from 'react';
import styled from 'styled-components';

import {
  format,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';

import { Button, Card, Font, H2, P, Seal } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { RemoveElectionModal } from '../components/remove_election_modal';
import { ExportElectionPackageModalButton } from '../components/export_election_package_modal_button';

const ElectionCard = styled(Card).attrs({ color: 'neutral' })`
  margin: 1rem 0;

  > div {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
  }
`;

export function ElectionScreen(): JSX.Element {
  const { electionDefinition, configuredAt, auth } = useContext(AppContext);
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
          .
        </P>
        <ElectionCard>
          <Seal seal={election.seal} maxWidth="7rem" />
          <div>
            <H2 as="h3">{election.title}</H2>
            <P>
              {election.county.name}, {election.state}
              <br />
              {format.localeDate(new Date(election.date))}
            </P>
          </div>
        </ElectionCard>
        {isSystemAdministratorAuth(auth) && (
          <Button
            color="danger"
            icon="Delete"
            onPress={() => setIsRemovingElection(true)}
          >
            Remove Election
          </Button>
        )}
        {isElectionManagerAuth(auth) && (
          <React.Fragment>
            <P>
              Save the election package to the USB drive to configure
              VxCentralScan or VxScan.
            </P>
            <P>
              <ExportElectionPackageModalButton />
            </P>
          </React.Fragment>
        )}
      </NavigationScreen>
      {isRemovingElection && (
        <RemoveElectionModal onClose={() => setIsRemovingElection(false)} />
      )}
    </React.Fragment>
  );
}
