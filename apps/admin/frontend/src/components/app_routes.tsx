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
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  isVendorAuth,
} from '@votingworks/utils';
import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';
import { assert } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context.js';
import { routerPaths } from '../router_paths.js';
import { ElectionScreen } from '../screens/election_screen.js';
import { UnconfiguredScreen } from '../screens/unconfigured_screen.js';
import { TallyScreen } from '../screens/tally/tally_screen.js';
import { TallyWriteInReportScreen } from '../screens/reporting/write_in_adjudication_report_screen.js';
import { WriteInImageReportScreen } from '../screens/reporting/write_in_image_report_screen.js';
import { VoterTurnoutReportScreen } from '../screens/reporting/voter_turnout_report_screen.js';
import { SendTallyReportsScreen } from '../screens/reporting/send_tally_reports_screen.js';
import { ManualTalliesFormScreen } from '../screens/tally/manual_tallies_form_screen.js';
import { SmartCardsScreen } from '../screens/smart_cards_screen.js';
import { MachineLockedScreen } from '../screens/machine_locked_screen.js';
import { SettingsScreen } from '../screens/settings_screen.js';
import { ReportsScreen } from '../screens/reporting/reports_screen.js';
import { checkPin, logOut, unconfigure, useApiClient } from '../api.js';
import { TallyReportBuilder } from '../screens/reporting/tally_report_builder.js';
import { BallotCountReportBuilder } from '../screens/reporting/ballot_count_report_builder.js';
import { AllPrecinctsTallyReportScreen } from '../screens/reporting/all_precincts_tally_report_screen.js';
import { SinglePrecinctTallyReportScreen } from '../screens/reporting/single_precinct_tally_report_screen.js';
import { PrecinctBallotCountReport } from '../screens/reporting/precinct_ballot_count_report_screen.js';
import { VotingMethodBallotCountReport } from '../screens/reporting/voting_method_ballot_count_report_screen.js';
import { FullElectionTallyReportScreen } from '../screens/reporting/full_election_tally_report_screen.js';
import { DiagnosticsScreen } from '../screens/diagnostics_screen.js';
import { AdjudicationStartScreen } from '../screens/adjudication_start_screen.js';
import { BallotAdjudicationScreenWrapper as BallotAdjudicationScreen } from '../screens/ballot_adjudication_screen.js';
import { WriteInCandidatesScreen } from '../screens/write_in_candidates_screen.js';
import { BackupsScreen } from '../screens/backups_screen.js';

export function AppRoutes(): JSX.Element | null {
  const { electionDefinition, auth } = useContext(AppContext);
  const election = electionDefinition?.election;
  const apiClient = useApiClient();
  const checkPinMutation = checkPin.useMutation();
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();

  const hasCardReaderAttached = !(
    auth.status === 'logged_out' && auth.reason === 'no_card_reader'
  );
  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage />;
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
        apiClient={apiClient}
        isMachineConfigured={Boolean(electionDefinition)}
        logOut={logOutMutation.mutate}
        unconfigureMachine={() => unconfigureMutation.mutateAsync()}
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
        <Route exact path={routerPaths.backups}>
          <BackupsScreen />
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
      <Route exact path={routerPaths.ballotAdjudication}>
        <BallotAdjudicationScreen />
      </Route>
      <Route exact path={routerPaths.adjudicationCandidates}>
        <WriteInCandidatesScreen />
      </Route>
      <Route path={routerPaths.adjudication}>
        <AdjudicationStartScreen />
      </Route>
      <Route
        path={routerPaths.tallyManualForm({
          precinctId: ':precinctId',
          ballotStyleGroupId: ':ballotStyleGroupId',
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
      <Route exact path={routerPaths.writeInImageReport}>
        <WriteInImageReportScreen />
      </Route>
      <Route exact path={routerPaths.voterTurnoutReport}>
        <VoterTurnoutReportScreen />
      </Route>
      <Route exact path={routerPaths.sendTallyReports}>
        <SendTallyReportsScreen />
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
