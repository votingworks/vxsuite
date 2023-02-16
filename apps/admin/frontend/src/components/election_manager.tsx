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
import { PartyId } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { DefinitionScreen } from '../screens/definition_screen';
import { BallotListScreen } from '../screens/ballot_list_screen';
import { BallotScreen } from '../screens/ballot_screen';
import { PrintTestDeckScreen } from '../screens/print_test_deck_screen';
import { UnconfiguredScreen } from '../screens/unconfigured_screen';
import { TallyScreen } from '../screens/tally_screen';
import { TallyReportScreen } from '../screens/tally_report_screen';
import { TallyWriteInReportScreen } from '../screens/tally_writein_report_screen';
import { DefinitionEditorScreen } from '../screens/definition_editor_screen';
import { DefinitionContestsScreen } from '../screens/definition_contests_screen';
import { PrintedBallotsReportScreen } from '../screens/printed_ballots_report_screen';
import { ManualDataImportIndexScreen } from '../screens/manual_data_import_index_screen';
import { ManualDataImportPrecinctScreen } from '../screens/manual_data_import_precinct_screen';
import { SmartcardsScreen } from '../screens/smartcards_screen';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { WriteInsScreen } from '../screens/write_ins_screen';
import { LogicAndAccuracyScreen } from '../screens/logic_and_accuracy_screen';
import { SettingsScreen } from '../screens/settings_screen';
import { LogsScreen } from '../screens/logs_screen';
import { ReportsScreen } from '../screens/reports_screen';
import { SmartcardTypeRegExPattern } from '../config/types';
import { SmartcardModal } from './smartcard_modal';
import { checkPin } from '../api';

export function ElectionManager(): JSX.Element {
  const { electionDefinition, configuredAt, auth, hasCardReaderAttached } =
    useContext(AppContext);
  const election = electionDefinition?.election;
  const checkPinMutation = checkPin.useMutation();

  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage usePollWorkerLanguage={false} />;
  }

  if (auth.status === 'checking_passcode') {
    return (
      <UnlockMachineScreen
        auth={auth}
        checkPin={(pin) => checkPinMutation.mutate({ pin })}
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
    if (auth.reason === 'machine_not_configured') {
      return (
        <InvalidCardScreen
          reason={auth.reason}
          recommendedAction="Please insert a System Administrator card."
        />
      );
    }
    return <InvalidCardScreen reason={auth.reason} />;
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
          <Route exact path={routerPaths.definitionEditor}>
            <DefinitionEditorScreen allowEditing={false} />
          </Route>
          <Route
            exact
            path={routerPaths.definitionContest({ contestId: ':contestId' })}
          >
            <DefinitionContestsScreen allowEditing={false} />
          </Route>
          <Route exact path={routerPaths.ballotsList}>
            <BallotListScreen />
          </Route>
          <Route
            exact
            path={[
              routerPaths.ballotsViewLanguage({
                ballotStyleId: ':ballotStyleId',
                precinctId: ':precinctId',
                localeCode: ':localeCode',
              }),
              routerPaths.ballotsView({
                ballotStyleId: ':ballotStyleId',
                precinctId: ':precinctId',
              }),
            ]}
          >
            <BallotScreen />
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
      <Route exact path={routerPaths.printedBallotsReport}>
        <PrintedBallotsReportScreen />
      </Route>
      <Route exact path={routerPaths.manualDataImport}>
        <ManualDataImportIndexScreen />
      </Route>
      {isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
      ) && (
        <Route exact path={routerPaths.writeIns}>
          <WriteInsScreen />
        </Route>
      )}
      <Route
        exact
        path={routerPaths.manualDataImportForPrecinct({
          precinctId: ':precinctId',
        })}
      >
        <ManualDataImportPrecinctScreen />
      </Route>
      <Route
        exact
        path={[
          routerPaths.ballotsViewLanguage({
            ballotStyleId: ':ballotStyleId',
            precinctId: ':precinctId',
            localeCode: ':localeCode',
          }),
          routerPaths.ballotsView({
            ballotStyleId: ':ballotStyleId',
            precinctId: ':precinctId',
          }),
        ]}
      >
        <BallotScreen />
      </Route>
      <Route exact path={routerPaths.tally}>
        <TallyScreen />
      </Route>
      <Route exact path={routerPaths.reports}>
        <ReportsScreen />
      </Route>
      <Route
        exact
        path={[
          routerPaths.tallyPrecinctReport({ precinctId: ':precinctId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route exact path={[routerPaths.tallyWriteInReport]}>
        <TallyWriteInReportScreen />
      </Route>
      <Route
        exact
        path={[
          routerPaths.tallyScannerReport({ scannerId: ':scannerId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        exact
        path={[
          routerPaths.tallyPartyReport({ partyId: ':partyId' as PartyId }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        exact
        path={[
          routerPaths.tallyBatchReport({ batchId: ':batchId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        exact
        path={[
          routerPaths.tallyVotingMethodReport({
            votingMethod: ':votingMethod',
          }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route exact path={routerPaths.logicAndAccuracy}>
        <LogicAndAccuracyScreen />
      </Route>
      <Route exact path={[routerPaths.testDecks]}>
        <PrintTestDeckScreen />
      </Route>
      <Redirect to={routerPaths.ballotsList} />
    </Switch>
  );
}
