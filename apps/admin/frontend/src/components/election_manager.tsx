import React, { useContext } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';
import {
  SetupCardReaderPage,
  InvalidCardScreen,
  UnlockMachineScreen,
  RemoveCardScreen,
} from '@votingworks/ui';

import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { DefinitionScreen } from '../screens/definition_screen';
import { BallotListScreen } from '../screens/ballot_list_screen';
import { PrintTestDeckScreen } from '../screens/print_test_deck_screen';
import { UnconfiguredScreen } from '../screens/unconfigured_screen';
import { TallyScreen } from '../screens/tally_screen';
import { TallyWriteInReportScreen } from '../screens/reporting/write_in_adjudication_report_screen';
import { ManualDataSummaryScreen } from '../screens/manual_data_summary_screen';
import { ManualDataEntryScreen } from '../screens/manual_data_entry_screen';
import { SmartcardsScreen } from '../screens/smartcards_screen';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { WriteInsSummaryScreen } from '../screens/write_ins_summary_screen';
import { LogicAndAccuracyScreen } from '../screens/logic_and_accuracy_screen';
import { SettingsScreen } from '../screens/settings_screen';
import { LogsScreen } from '../screens/logs_screen';
import { ReportsScreen } from '../screens/reporting/reports_screen';
import { ElectionManagerSystemScreen } from '../screens/election_manager_system_screen';
import { SmartcardTypeRegExPattern } from '../config/types';
import { SmartcardModal } from './smartcard_modal';
import { checkPin } from '../api';
import { canViewAndPrintBallots } from '../utils/can_view_and_print_ballots';
import { WriteInsAdjudicationScreen } from '../screens/write_ins_adjudication_screen';
import { TallyReportBuilder } from '../screens/reporting/tally_report_builder';
import { BallotCountReportBuilder } from '../screens/reporting/ballot_count_report_builder';
import { AllPrecinctsTallyReportScreen } from '../screens/reporting/all_precincts_tally_report_screen';
import { SinglePrecinctTallyReportScreen } from '../screens/reporting/single_precinct_tally_report_screen';
import { PrecinctBallotCountReport } from '../screens/reporting/precinct_ballot_count_report_screen';
import { VotingMethodBallotCountReport } from '../screens/reporting/voting_method_ballot_count_report_screen';
import { FullElectionTallyReportScreen } from '../screens/reporting/full_election_tally_report_screen';

export function ElectionManager(): JSX.Element {
  const { electionDefinition, configuredAt, auth, hasCardReaderAttached } =
    useContext(AppContext);
  const election = electionDefinition?.election;
  const checkPinMutation = checkPin.useMutation();

  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage usePollWorkerLanguage={false} />;
  }

  if (auth.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={auth}
        checkPin={async (pin) => {
          try {
            await checkPinMutation.mutateAsync({ pin });
          } catch {
            // Handled by default query client error handling
          }
        }}
      />
    );
  }

  if (auth.status === 'remove_card') {
    return <RemoveCardScreen productName="VxAdmin" />;
  }

  if (auth.status === 'logged_out') {
    if (auth.reason === 'machine_locked') {
      return <MachineLockedScreen />;
    }
    return (
      <InvalidCardScreen
        reasonAndContext={auth}
        recommendedAction={
          auth.reason === 'machine_not_configured'
            ? 'Please insert a System Administrator card.'
            : 'Please insert a valid Election Manager or System Administrator card.'
        }
      />
    );
  }

  if (isSystemAdministratorAuth(auth)) {
    if (!election || !configuredAt) {
      return (
        <React.Fragment>
          <Switch>
            <Route exact path={routerPaths.electionDefinition}>
              <UnconfiguredScreen />
            </Route>
            <Route exact path={routerPaths.settings}>
              <SettingsScreen />
            </Route>
            <Route exact path={routerPaths.logs}>
              <LogsScreen />
            </Route>
            <Redirect to={routerPaths.electionDefinition} />
          </Switch>
          <SmartcardModal />
        </React.Fragment>
      );
    }

    return (
      <React.Fragment>
        <Switch>
          <Route exact path={routerPaths.electionDefinition}>
            <DefinitionScreen />
          </Route>
          <Route exact path={routerPaths.smartcards}>
            <Redirect
              to={routerPaths.smartcardsByType({ smartcardType: 'election' })}
            />
          </Route>
          <Route
            exact
            path={routerPaths.smartcardsByType({
              smartcardType: `:smartcardType${SmartcardTypeRegExPattern}`,
            })}
          >
            <SmartcardsScreen />
          </Route>
          <Route exact path={routerPaths.settings}>
            <SettingsScreen />
          </Route>
          <Route exact path={routerPaths.logs}>
            <LogsScreen />
          </Route>
          <Redirect to={routerPaths.electionDefinition} />
        </Switch>
        <SmartcardModal />
      </React.Fragment>
    );
  }

  // Election manager UI
  return (
    <Switch>
      <Route exact path={routerPaths.ballotsList}>
        <BallotListScreen />
      </Route>
      <Route exact path={routerPaths.manualDataSummary}>
        <ManualDataSummaryScreen />
      </Route>
      {isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
      ) && (
        <Route exact path={routerPaths.writeIns}>
          <WriteInsSummaryScreen />
        </Route>
      )}
      {isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
      ) && (
        <Route
          exact
          path={routerPaths.writeInsAdjudication({ contestId: ':contestId' })}
        >
          <WriteInsAdjudicationScreen />
        </Route>
      )}
      <Route
        exact
        path={routerPaths.manualDataEntry({
          precinctId: ':precinctId',
          ballotStyleId: ':ballotStyleId',
          votingMethod: ':votingMethod' as ManualResultsVotingMethod,
        })}
      >
        <ManualDataEntryScreen />
      </Route>
      <Route exact path={routerPaths.tally}>
        <TallyScreen />
      </Route>
      <Route exact path={routerPaths.reports}>
        <ReportsScreen />
      </Route>
      <Route exact path={routerPaths.tallyReportBuilder}>
        <TallyReportBuilder />
      </Route>
      <Route exact path={routerPaths.tallyFullReport}>
        <FullElectionTallyReportScreen />
      </Route>
      <Route exact path={routerPaths.tallySinglePrecinctReport}>
        <SinglePrecinctTallyReportScreen />
      </Route>
      <Route exact path={routerPaths.tallyAllPrecinctsReport}>
        <AllPrecinctsTallyReportScreen />
      </Route>
      <Route exact path={routerPaths.ballotCountReportBuilder}>
        <BallotCountReportBuilder />
      </Route>
      <Route exact path={routerPaths.ballotCountReportPrecinct}>
        <PrecinctBallotCountReport />
      </Route>
      <Route exact path={routerPaths.ballotCountReportVotingMethod}>
        <VotingMethodBallotCountReport />
      </Route>
      <Route exact path={[routerPaths.tallyWriteInReport]}>
        <TallyWriteInReportScreen />
      </Route>
      {election && canViewAndPrintBallots(election) && (
        <Route exact path={routerPaths.logicAndAccuracy}>
          <LogicAndAccuracyScreen />
        </Route>
      )}
      <Route exact path={[routerPaths.testDecks]}>
        <PrintTestDeckScreen />
      </Route>
      <Route exact path={routerPaths.system}>
        <ElectionManagerSystemScreen />
      </Route>
      <Redirect to={routerPaths.ballotsList} />
    </Switch>
  );
}
