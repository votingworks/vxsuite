import React, { useContext } from 'react';
import styled from 'styled-components';

import { assert } from '@votingworks/basics';
import { Prose } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { ExportElectionBallotPackageModalButton } from '../components/export_election_ballot_package_modal_button';

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export function BallotListScreen(): JSX.Element {
  const { configuredAt, electionDefinition } = useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');

  return (
    <NavigationScreen title="Ballots">
      <Header>
        <Prose>
          <p>
            Save the Ballot Package to USB to configure VxCentralScan or VxScan.
          </p>
          <p>
            <ExportElectionBallotPackageModalButton />
          </p>
        </Prose>
      </Header>
    </NavigationScreen>
  );
}
