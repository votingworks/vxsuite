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
import { ElectionScreen } from '../screens/election_screen';
import { UnconfiguredScreen } from '../screens/unconfigured_screen';
import { TallyScreen } from '../screens/tally_screen';
import { TallyWriteInReportScreen } from '../screens/reporting/write_in_adjudication_report_screen';
import { ManualDataSummaryScreen } from '../screens/manual_data_summary_screen';
import { ManualDataEntryScreen } from '../screens/manual_data_entry_screen';
import { SmartcardsScreen } from '../screens/smartcards_screen';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { WriteInsSummaryScreen } from '../screens/write_ins_summary_screen';
import { SettingsScreen } from '../screens/settings_screen';
import { ReportsScreen } from '../screens/reporting/reports_screen';
import { SmartcardTypeRegExPattern } from '../config/types';
import { SmartcardModal } from './smartcard_modal';
import { checkPin } from '../api';
import { WriteInsAdjudicationScreen } from '../screens/write_ins_adjudication_screen';
import { TallyReportBuilder } from '../screens/reporting/tally_report_builder';
import { BallotCountReportBuilder } from '../screens/reporting/ballot_count_report_builder';
import { AllPrecinctsTallyReportScreen } from '../screens/reporting/all_precincts_tally_report_screen';
import { SinglePrecinctTallyReportScreen } from '../screens/reporting/single_precinct_tally_report_screen';
import { PrecinctBallotCountReport } from '../screens/reporting/precinct_ballot_count_report_screen';
import { VotingMethodBallotCountReport } from '../screens/reporting/voting_method_ballot_count_report_screen';
import { FullElectionTallyReportScreen } from '../screens/reporting/full_election_tally_report_screen';

export function AppRoutes(): JSX.Element {
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
          electionDefinition
            ? 'Use a valid Election Manager or System Administrator card.'
            : 'Use a System Administrator card.'
        }
      />
    );
  }

  if (isSystemAdministratorAuth(auth)) {
    if (!election || !configuredAt) {
      return (
        <React.Fragment>
          <Switch>
            <Route exact path={routerPaths.election}>
              <UnconfiguredScreen />
            </Route>
            <Route exact path={routerPaths.settings}>
              <SettingsScreen />
            </Route>
            <Redirect to={routerPaths.election} />
          </Switch>
          <SmartcardModal />
        </React.Fragment>
      );
    }

    return (
      <React.Fragment>
        <Switch>
          <Route exact path={routerPaths.election}>
            <ElectionScreen />
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
          <Redirect to={routerPaths.election} />
        </Switch>
        <SmartcardModal />
      </React.Fragment>
    );
  }

  // Election manager UI
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
      <Route exact path={routerPaths.settings}>
        <SettingsScreen />
      </Route>
      <Redirect to={routerPaths.election} />
    </Switch>
  );
}
