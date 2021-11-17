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
import * as AdminScreen from './screens/admin_screen';
import * as InsertBallotScreen from './screens/insert_ballot_screen';
import * as InvalidCardScreen from './screens/invalid_card_screen';
import * as LoadingConfigurationScreen from './screens/loading_configuration_screen';
import * as PollsClosedScreen from './screens/polls_closed_screen';
import * as PollWorkerScreen from './screens/poll_worker_screen';
import * as ScanErrorScreen from './screens/scan_error_screen';
import * as ScanProcessingScreen from './screens/scan_processing_screen';
import * as ScanSuccessScreen from './screens/scan_success_screen';
import * as ScanWarningScreen from './screens/scan_warning_screen';
import * as SetupPowerPage from './screens/setup_power_page';
import * as UnconfiguredElectionScreen from './screens/unconfigured_election_screen';
import * as UnlockAdminScreen from './screens/unlock_admin_screen';

export function PreviewApp(): JSX.Element {
  return (
    <PreviewDashboard
      electionDefinitions={[
        electionSampleDefinition,
        primaryElectionSampleDefinition,
        electionWithMsEitherNeitherDefinition,
      ]}
      modules={[
        AdminScreen,
        InsertBallotScreen,
        InvalidCardScreen,
        LoadingConfigurationScreen,
        PollsClosedScreen,
        PollWorkerScreen,
        ScanErrorScreen,
        ScanProcessingScreen,
        ScanSuccessScreen,
        ScanWarningScreen,
        SetupPowerPage,
        UnconfiguredElectionScreen,
        UnlockAdminScreen,
      ]}
    />
  );
}
