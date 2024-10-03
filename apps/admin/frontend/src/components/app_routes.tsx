import { useContext } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';
import {
  SetupCardReaderPage,
  InvalidCardScreen,
  UnlockMachineScreen,
  RemoveCardScreen,
  VendorScreen,
} from '@votingworks/ui';

import {
  BooleanEnvironmentVariableName,
  isElectionManagerAuth,
  isFeatureFlagEnabled,
  isSystemAdministratorAuth,
  isVendorAuth,
} from '@votingworks/utils';
import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';
import { assert } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { ElectionScreen } from '../screens/election_screen';
import { UnconfiguredScreen } from '../screens/unconfigured_screen';
import { TallyScreen } from '../screens/tally_screen';
import { TallyWriteInReportScreen } from '../screens/reporting/write_in_adjudication_report_screen';
import { ManualDataSummaryScreen } from '../screens/manual_data_summary_screen';
import { ManualDataEntryScreen } from '../screens/manual_data_entry_screen';
import { SmartCardsScreen } from '../screens/smart_cards_screen';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { WriteInsSummaryScreen } from '../screens/write_ins_summary_screen';
import { SettingsScreen } from '../screens/settings_screen';
import { ReportsScreen } from '../screens/reporting/reports_screen';
import { checkPin, logOut, useApiClient } from '../api';
import { WriteInsAdjudicationScreen } from '../screens/write_ins_adjudication_screen';
import { TallyReportBuilder } from '../screens/reporting/tally_report_builder';
import { BallotCountReportBuilder } from '../screens/reporting/ballot_count_report_builder';
import { AllPrecinctsTallyReportScreen } from '../screens/reporting/all_precincts_tally_report_screen';
import { SinglePrecinctTallyReportScreen } from '../screens/reporting/single_precinct_tally_report_screen';
import { PrecinctBallotCountReport } from '../screens/reporting/precinct_ballot_count_report_screen';
import { VotingMethodBallotCountReport } from '../screens/reporting/voting_method_ballot_count_report_screen';
import { FullElectionTallyReportScreen } from '../screens/reporting/full_election_tally_report_screen';
import { DiagnosticsScreen } from '../screens/diagnostics_screen';

export function AppRoutes(): JSX.Element | null {
  const { electionDefinition, auth } = useContext(AppContext);
  const election = electionDefinition?.election;
  const apiClient = useApiClient();
  const checkPinMutation = checkPin.useMutation();
  const logOutMutation = logOut.useMutation();

  const hasCardReaderAttached = !(
    auth.status === 'logged_out' && auth.reason === 'no_card_reader'
  );
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
    return (
      <RemoveCardScreen productName="VxAdmin" cardInsertionDirection="right" />
    );
  }

  if (auth.status === 'logged_out') {
    if (
      auth.reason === 'machine_locked' ||
      auth.reason === 'machine_locked_by_session_expiry'
    ) {
      return <MachineLockedScreen />;
    }
    return (
      <InvalidCardScreen
        reasonAndContext={auth}
        recommendedAction={
          electionDefinition
            ? 'Use a valid Election Manager or System Administrator card.'
            : 'Use a System Administrator card.'
        }
        cardInsertionDirection="right"
      />
    );
  }

  if (isVendorAuth(auth)) {
    return (
      <VendorScreen
        logOut={() => logOutMutation.mutate()}
        rebootToVendorMenu={() => apiClient.rebootToVendorMenu()}
      />
    );
  }

  if (isSystemAdministratorAuth(auth)) {
    return (
      <Switch>
        <Route exact path={routerPaths.election}>
          {election ? <ElectionScreen /> : <UnconfiguredScreen />}
        </Route>
        <Route exact path={routerPaths.smartcards}>
          <SmartCardsScreen />
        </Route>
        <Route exact path={routerPaths.settings}>
          <SettingsScreen />
        </Route>
        <Route exact path={routerPaths.hardwareDiagnostics}>
          <DiagnosticsScreen />
        </Route>
        <Redirect to={routerPaths.election} />
      </Switch>
    );
  }

  // Election manager UI
  assert(isElectionManagerAuth(auth));
  return (
    <Switch>
      <Route exact path={routerPaths.election}>
        <ElectionScreen />
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
          ballotStyleGroupId: ':ballotStyleGroupId',
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
      <Route exact path={routerPaths.settings}>
        <SettingsScreen />
      </Route>
      <Route exact path={routerPaths.hardwareDiagnostics}>
        <DiagnosticsScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
