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
import { BallotStyleGroupId } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { ElectionScreen } from '../screens/election_screen';
import { UnconfiguredScreen } from '../screens/unconfigured_screen';
import { TallyScreen } from '../screens/tally/tally_screen';
import { TallyWriteInReportScreen } from '../screens/reporting/write_in_adjudication_report_screen';
import { ManualTalliesFormScreen } from '../screens/tally/manual_tallies_form_screen';
import { SmartCardsScreen } from '../screens/smart_cards_screen';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { AdjudicationSummaryScreen } from '../screens/adjudication_summary_screen';
import { SettingsScreen } from '../screens/settings_screen';
import { ReportsScreen } from '../screens/reporting/reports_screen';
import { checkPin, logOut, useApiClient } from '../api';
import { TallyReportBuilder } from '../screens/reporting/tally_report_builder';
import { BallotCountReportBuilder } from '../screens/reporting/ballot_count_report_builder';
import { AllPrecinctsTallyReportScreen } from '../screens/reporting/all_precincts_tally_report_screen';
import { SinglePrecinctTallyReportScreen } from '../screens/reporting/single_precinct_tally_report_screen';
import { PrecinctBallotCountReport } from '../screens/reporting/precinct_ballot_count_report_screen';
import { VotingMethodBallotCountReport } from '../screens/reporting/voting_method_ballot_count_report_screen';
import { FullElectionTallyReportScreen } from '../screens/reporting/full_election_tally_report_screen';
import { DiagnosticsScreen } from '../screens/diagnostics_screen';
import { ContestAdjudicationScreen } from '../screens/contest_adjudication_screen';

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
            ? 'Use a valid election manager or system administrator card.'
            : 'Use a system administrator card.'
        }
        cardInsertionDirection="right"
      />
    );
  }

  if (isVendorAuth(auth)) {
    return (
      <VendorScreen
        logOut={logOutMutation.mutate}
        rebootToVendorMenu={apiClient.rebootToVendorMenu}
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
      {isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
      ) && (
        <Route exact path={routerPaths.adjudication}>
          <AdjudicationSummaryScreen />
        </Route>
      )}
      {isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
      ) && (
        <Route
          exact
          path={routerPaths.contestAdjudication({ contestId: ':contestId' })}
        >
          <ContestAdjudicationScreen />
        </Route>
      )}
      <Route
        path={routerPaths.tallyManualForm({
          precinctId: ':precinctId',
          ballotStyleGroupId: ':ballotStyleGroupId' as BallotStyleGroupId,
          votingMethod: ':votingMethod' as ManualResultsVotingMethod,
        })}
      >
        <ManualTalliesFormScreen />
      </Route>
      <Route path={routerPaths.tally}>
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
