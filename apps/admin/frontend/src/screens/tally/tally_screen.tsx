import React, { useContext, useState } from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Button, Icons, H3, RouterTabBar } from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import { OfficialResultsCard } from '../../components/official_results_card';
import { CastVoteRecordsTab } from './cast_vote_records_tab';
import { ManualTalliesTab } from './manual_tallies_tab';
import { routerPaths } from '../../router_paths';
import { ConfirmRemoveAllResultsModal } from './confirm_remove_all_results_modal';

export function TallyScreen(): JSX.Element | null {
  const { electionDefinition, isOfficialResults, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth));

  const [
    isConfirmRemoveAllResultsModalOpen,
    setIsConfirmRemoveAllResultsModalOpen,
  ] = useState(false);

  return (
    <React.Fragment>
      <NavigationScreen title="Tally">
        {isOfficialResults && (
          <OfficialResultsCard>
            <H3>
              <Icons.Done color="success" />
              Election Results are Official
            </H3>
            <Button
              onPress={() => setIsConfirmRemoveAllResultsModalOpen(true)}
              icon="Delete"
              color="danger"
            >
              Remove All Tallies
            </Button>
          </OfficialResultsCard>
        )}

        <RouterTabBar
          tabs={[
            {
              title: 'Cast Vote Records (CVRs)',
              path: routerPaths.tallyCvrs,
            },
            {
              title: 'Manual Tallies',
              path: routerPaths.tallyManual,
            },
          ]}
        />

        <Switch>
          <Route
            exact
            path={routerPaths.tallyCvrs}
            component={CastVoteRecordsTab}
          />
          <Route
            exact
            path={routerPaths.tallyManual}
            component={ManualTalliesTab}
          />
          <Redirect from={routerPaths.tally} to={routerPaths.tallyCvrs} />
        </Switch>
      </NavigationScreen>

      {isConfirmRemoveAllResultsModalOpen && (
        <ConfirmRemoveAllResultsModal
          onClose={() => setIsConfirmRemoveAllResultsModalOpen(false)}
        />
      )}
    </React.Fragment>
  );
}
