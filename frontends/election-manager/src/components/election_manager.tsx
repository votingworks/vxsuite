import React, { useContext } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';

import {
  fontSizeTheme,
  ElectionInfoBar,
  Main,
  Prose,
  RebootFromUsbButton,
  Screen,
  SetupCardReaderPage,
  isSuperadminAuth,
  InvalidCardScreen,
  UnlockMachineScreen,
  RemoveCardScreen,
} from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';
import { DefinitionScreen } from '../screens/definition_screen';
import { BallotListScreen } from '../screens/ballot_list_screen';
import { BallotScreen } from '../screens/ballot_screen';
import { PrintTestDeckScreen } from '../screens/print_test_deck_screen';
import { UnconfiguredScreen } from '../screens/unconfigured_screen';
import { TallyScreen } from '../screens/tally_screen';
import { TallyReportScreen } from '../screens/tally_report_screen';
import { OvervoteCombinationReportScreen } from '../screens/overvote_combination_report_screen';
import { DefinitionEditorScreen } from '../screens/definition_editor_screen';
import { DefinitionContestsScreen } from '../screens/definition_contests_screen';
import { PrintedBallotsReportScreen } from '../screens/printed_ballots_report_screen';
import { ManualDataImportIndexScreen } from '../screens/manual_data_import_index_screen';
import { ManualDataImportPrecinctScreen } from '../screens/manual_data_import_precinct_screen';
import { LegacySmartcardsScreen } from '../screens/legacy_smartcards_screen';
import { SmartcardsScreen } from '../screens/smartcards_screen';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { AdvancedScreen } from '../screens/advanced_screen';
import { WriteInsScreen } from '../screens/write_ins_screen';
import { LogicAndAccuracyScreen } from '../screens/logic_and_accuracy_screen';
import { SettingsScreen } from '../screens/settings_screen';
import { LogsScreen } from '../screens/logs_screen';
import {
  areVvsg2AuthFlowsEnabled,
  isWriteInAdjudicationEnabled,
} from '../config/features';

export function ElectionManager(): JSX.Element {
  const {
    electionDefinition,
    configuredAt,
    auth,
    hasCardReaderAttached,
    machineConfig,
    usbDriveStatus,
    logger,
  } = useContext(AppContext);
  const election = electionDefinition?.election;

  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage usePollWorkerLanguage={false} />;
  }

  if (auth.status === 'checking_passcode') {
    return <UnlockMachineScreen auth={auth} />;
  }

  if (auth.status === 'remove_card') {
    return <RemoveCardScreen />;
  }

  if (!areVvsg2AuthFlowsEnabled() && (!election || !configuredAt)) {
    return (
      <Switch>
        <Route exact path={routerPaths.root}>
          <UnconfiguredScreen />
        </Route>
        <Route exact path={routerPaths.electionDefinition}>
          <UnconfiguredScreen />
        </Route>
        <Route exact path={routerPaths.advanced}>
          <AdvancedScreen />
        </Route>
      </Switch>
    );
  }

  if (auth.status === 'logged_out') {
    if (auth.reason === 'machine_locked') return <MachineLockedScreen />;
    return <InvalidCardScreen />;
  }

  if (isSuperadminAuth(auth)) {
    if (!areVvsg2AuthFlowsEnabled()) {
      return (
        <Screen>
          <Main centerChild>
            <Prose textCenter maxWidth={false} theme={fontSizeTheme.large}>
              <RebootFromUsbButton
                usbDriveStatus={usbDriveStatus}
                logger={logger}
              />
            </Prose>
          </Main>
          <ElectionInfoBar
            mode="admin"
            electionDefinition={electionDefinition}
            codeVersion={machineConfig.codeVersion}
            machineId={machineConfig.machineId}
          />
        </Screen>
      );
    }

    if (!election || !configuredAt) {
      return (
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
      );
    }

    return (
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
        <Route exact path={routerPaths.printedBallotsReport}>
          <PrintedBallotsReportScreen />
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
            smartcardType: ':smartcardType',
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
    );
  }

  return (
    <Switch>
      {!areVvsg2AuthFlowsEnabled() && (
        <Route exact path={routerPaths.advanced}>
          <AdvancedScreen />
        </Route>
      )}
      {!areVvsg2AuthFlowsEnabled() && (
        <Route exact path={routerPaths.electionDefinition}>
          <DefinitionScreen />
        </Route>
      )}
      {!areVvsg2AuthFlowsEnabled() && (
        <Route exact path={routerPaths.definitionEditor}>
          <DefinitionEditorScreen allowEditing={false} />
        </Route>
      )}
      {!areVvsg2AuthFlowsEnabled() && (
        <Route
          exact
          path={routerPaths.definitionContest({ contestId: ':contestId' })}
        >
          <DefinitionContestsScreen allowEditing={false} />
        </Route>
      )}
      {!areVvsg2AuthFlowsEnabled() && (
        <Route exact path={routerPaths.smartcards}>
          <LegacySmartcardsScreen />
        </Route>
      )}
      <Route exact path={routerPaths.ballotsList}>
        <BallotListScreen />
      </Route>
      <Route exact path={routerPaths.printedBallotsReport}>
        <PrintedBallotsReportScreen />
      </Route>
      <Route exact path={routerPaths.manualDataImport}>
        <ManualDataImportIndexScreen />
      </Route>
      {isWriteInAdjudicationEnabled() && (
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
      <Route
        exact
        path={[
          routerPaths.tallyPrecinctReport({ precinctId: ':precinctId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
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
          routerPaths.tallyPartyReport({ partyId: ':partyId' }),
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
      <Route exact path={routerPaths.overvoteCombinationReport}>
        <OvervoteCombinationReportScreen />
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
