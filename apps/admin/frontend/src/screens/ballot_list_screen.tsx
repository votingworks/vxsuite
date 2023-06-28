import React, { useContext } from 'react';

import { assert } from '@votingworks/basics';
import { P } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { ExportElectionBallotPackageModalButton } from '../components/export_election_ballot_package_modal_button';

export function BallotListScreen(): JSX.Element {
  const { configuredAt, electionDefinition } = useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');

  return (
    <NavigationScreen title="Ballots">
      <P>
        Save the Ballot Package to USB to configure VxCentralScan or VxScan.
      </P>
      <P>
        <ExportElectionBallotPackageModalButton />
      </P>
    </NavigationScreen>
  );
}
