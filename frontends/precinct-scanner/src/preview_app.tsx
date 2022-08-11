// This file is for development purposes only, so linting/coverage is relaxed.
/* eslint-disable vx/gts-direct-module-export-access-only */
/* istanbul ignore file */

import {
  electionSampleDefinition,
  electionWithMsEitherNeitherDefinition,
  primaryElectionSampleDefinition,
} from '@votingworks/fixtures';
import React from 'react';
import { PreviewDashboard } from './preview_dashboard';
import * as CardErrorScreen from './screens/card_error_screen';
import * as ElectionManagerScreen from './screens/election_manager_screen';
import * as InsertBallotScreen from './screens/insert_ballot_screen';
import * as InvalidCardScreen from './screens/invalid_card_screen';
import * as LoadingConfigurationScreen from './screens/loading_configuration_screen';
import * as PollsClosedScreen from './screens/polls_closed_screen';
import * as PollWorkerScreen from './screens/poll_worker_screen';
import * as ScanErrorScreen from './screens/scan_error_screen';
import * as ScanProcessingScreen from './screens/scan_processing_screen';
import * as ScanSuccessScreen from './screens/scan_success_screen';
import * as ScanWarningScreen from './screens/scan_warning_screen';
import * as ScanReturnedBallotScreen from './screens/scan_returned_ballot_screen';
import * as ScanJamScreen from './screens/scan_jam_screen';
import * as ScanBusyScreen from './screens/scan_busy_screen';
import * as SetupScannerScreen from './screens/setup_scanner_screen';
import * as UnconfiguredElectionScreen from './screens/unconfigured_election_screen';
import * as ReplaceBallotBagScreen from './components/replace_ballot_bag_screen';

export function PreviewApp(): JSX.Element {
  return (
    <PreviewDashboard
      electionDefinitions={[
        electionSampleDefinition,
        primaryElectionSampleDefinition,
        electionWithMsEitherNeitherDefinition,
      ]}
      modules={[
        CardErrorScreen,
        ElectionManagerScreen,
        InsertBallotScreen,
        InvalidCardScreen,
        LoadingConfigurationScreen,
        PollsClosedScreen,
        PollWorkerScreen,
        ScanErrorScreen,
        ScanProcessingScreen,
        ScanSuccessScreen,
        ScanWarningScreen,
        ScanReturnedBallotScreen,
        ScanJamScreen,
        ScanBusyScreen,
        SetupScannerScreen,
        UnconfiguredElectionScreen,
        ReplaceBallotBagScreen,
      ]}
    />
  );
}
