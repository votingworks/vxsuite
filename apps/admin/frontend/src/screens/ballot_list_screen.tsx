import React, { useContext } from 'react';
import styled from 'styled-components';

import { assert } from '@votingworks/basics';
import { Prose } from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { ExportElectionBallotPackageModalButton } from '../components/export_election_ballot_package_modal_button';

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export function BallotListScreen(): JSX.Element {
  const { auth, configuredAt, electionDefinition } = useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');

  return (
    <NavigationScreen>
      <Header>
        <Prose>
          <h1>Ballots</h1>
          <p>VxAdmin does not produce ballots for this election.</p>
          {isElectionManagerAuth(auth) ? (
            <React.Fragment>
              <p>
                Save the Ballot Package to USB to configure VxCentralScan or
                VxScan.
              </p>
              <p>
                <ExportElectionBallotPackageModalButton />
              </p>
            </React.Fragment>
          ) : (
            <p>
              <em>
                Lock machine, then insert Election Manager card to save the
                Ballot Package.
              </em>
            </p>
          )}
        </Prose>
      </Header>
    </NavigationScreen>
  );
}
