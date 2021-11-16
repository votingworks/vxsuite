import React, { useContext } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';

import { SetupCardReaderPage } from '@votingworks/ui';
import { PrecinctId } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';
import { DefinitionScreen } from '../screens/definition_screen';
import { BallotListScreen } from '../screens/ballot_list_screen';
import { BallotScreen } from '../screens/ballot_screen';
import { PrintTestDeckScreen } from '../screens/print_test_deck_screen';
import { UnconfiguredScreen } from '../screens/unconfigured_screen';
import { TestDeckScreen } from '../screens/test_deck_screen';
import { TallyScreen } from '../screens/tally_screen';
import { TallyReportScreen } from '../screens/tally_report_screen';
import { OvervoteCombinationReportScreen } from '../screens/overvote_combination_report_screen';
import { DefinitionEditorScreen } from '../screens/definition_editor_screen';
import { DefinitionContestsScreen } from '../screens/definition_contests_screen';
import { PrintedBallotsReportScreen } from '../screens/printed_ballots_report_screen';
import { ManualDataImportIndexScreen } from '../screens/manual_data_import_index_screen';
import { ManualDataImportPrecinctScreen } from '../screens/manual_data_import_precinct_screen';
import { SmartcardsScreen } from '../screens/smartcards_screen';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { InvalidCardScreen } from '../screens/invalid_card_screen';
import { UnlockMachineScreen } from '../screens/unlock_machine_screen';

export function ElectionManager(): JSX.Element {
  const {
    electionDefinition,
    currentUserSession,
    hasCardReaderAttached,
  } = useContext(AppContext);
  const election = electionDefinition?.election;

  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage />;
  }

  if (!election) {
    return <UnconfiguredScreen />;
  }

  if (!currentUserSession) {
    return <MachineLockedScreen />;
  }

  if (currentUserSession.type !== 'admin') {
    return <InvalidCardScreen />;
  }

  if (!currentUserSession.authenticated) {
    return <UnlockMachineScreen />;
  }

  return (
    <Switch>
      <Route exact path={routerPaths.electionDefinition}>
        <DefinitionScreen />
      </Route>
      <Route path={routerPaths.definitionEditor}>
        <DefinitionEditorScreen allowEditing={false} />
      </Route>
      <Route path={routerPaths.definitionContest({ contestId: ':contestId' })}>
        <DefinitionContestsScreen allowEditing={false} />
      </Route>
      <Route path={routerPaths.smartcards}>
        <SmartcardsScreen />
      </Route>
      <Route exact path={routerPaths.ballotsList}>
        <BallotListScreen />
      </Route>
      <Route exact path={routerPaths.printedBallotsReport}>
        <PrintedBallotsReportScreen />
      </Route>
      <Route exact path={routerPaths.manualDataImport}>
        <ManualDataImportIndexScreen />
      </Route>
      <Route
        path={routerPaths.manualDataImportForPrecinct({
          precinctId: ':precinctId' as PrecinctId,
        })}
      >
        <ManualDataImportPrecinctScreen />
      </Route>
      <Route
        path={[
          routerPaths.printOneTestDeck({
            precinctId: ':precinctId' as PrecinctId,
          }),
          routerPaths.printTestDecks,
        ]}
      >
        <PrintTestDeckScreen />
      </Route>
      <Route
        path={[
          routerPaths.testDeckResultsReport({
            precinctId: ':precinctId' as PrecinctId,
          }),
          routerPaths.testDecksTally,
        ]}
      >
        <TestDeckScreen />
      </Route>
      <Route
        path={[
          routerPaths.ballotsViewLanguage({
            ballotStyleId: ':ballotStyleId',
            precinctId: ':precinctId' as PrecinctId,
            localeCode: ':localeCode',
          }),
          routerPaths.ballotsView({
            ballotStyleId: ':ballotStyleId',
            precinctId: ':precinctId' as PrecinctId,
          }),
        ]}
      >
        <BallotScreen />
      </Route>
      <Route exact path={routerPaths.tally}>
        <TallyScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyPrecinctReport({
            precinctId: ':precinctId' as PrecinctId,
          }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyScannerReport({ scannerId: ':scannerId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyPartyReport({ partyId: ':partyId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyBatchReport({ batchId: ':batchId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyVotingMethodReport({
            votingMethod: ':votingMethod',
          }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route path={routerPaths.overvoteCombinationReport}>
        <OvervoteCombinationReportScreen />
      </Route>
      <Redirect to={routerPaths.ballotsList} />
    </Switch>
  );
}
