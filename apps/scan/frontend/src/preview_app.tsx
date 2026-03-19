// This file is for development purposes only, so linting/coverage is relaxed.
/* eslint-disable vx/gts-direct-module-export-access-only */
/* istanbul ignore file - @preserve */

import React from 'react';
import { handleKeyboardEvent } from '@votingworks/ui';
import { PreviewDashboard } from './preview_dashboard.js';
import * as AccessibilityInputDisconnectedScreen from './screens/accessibility_input_disconnected_screen.js';
import * as CardErrorScreen from './screens/card_error_screen.js';
import * as ElectionManagerScreen from './screens/election_manager_screen.js';
import * as SystemAdministratorScreen from './screens/system_administrator_screen.js';
import * as InsertBallotScreen from './screens/insert_ballot_screen.js';
import * as InsertUsbScreen from './screens/insert_usb_screen.js';
import * as InvalidCardScreen from './screens/invalid_card_screen.js';
import * as LoadingConfigurationScreen from './screens/loading_configuration_screen.js';
import * as PollsNotOpenScreen from './screens/polls_not_open_screen.js';
import * as PollWorkerScreen from './screens/poll_worker_screen.js';
import * as ScanDoubleSheetScreen from './screens/scan_double_sheet_screen.js';
import * as ScanErrorScreen from './screens/scan_error_screen.js';
import * as ScannerCoverOpenScreen from './screens/scanner_cover_open_screen.js';
import * as ScanProcessingScreen from './screens/scan_processing_screen.js';
import * as ScanSuccessScreen from './screens/scan_success_screen.js';
import * as ScanWarningScreen from './screens/scan_warning_screen.js';
import * as ScanReturnedBallotScreen from './screens/scan_returned_ballot_screen.js';
import * as ScanJamScreen from './screens/scan_jam_screen.js';
import * as ScanBusyScreen from './screens/scan_busy_screen.js';
import * as SetupScannerScreen from './screens/internal_connection_problem_screen.js';
import * as UnconfiguredElectionScreenWrapper from './screens/unconfigured_election_screen_wrapper.js';
import * as UnconfiguredPrecinctScreen from './screens/unconfigured_precinct_screen.js';
import { ScanAppBase } from './scan_app_base.js';

export function PreviewApp(): JSX.Element {
  // Handle navigation key events from the tactile controller/keyboard.
  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyboardEvent);
    return () => document.removeEventListener('keydown', handleKeyboardEvent);
  }, []);

  return (
    <ScanAppBase>
      <PreviewDashboard
        modules={[
          AccessibilityInputDisconnectedScreen,
          CardErrorScreen,
          ElectionManagerScreen,
          SystemAdministratorScreen,
          InsertBallotScreen,
          InsertUsbScreen,
          InvalidCardScreen,
          LoadingConfigurationScreen,
          PollsNotOpenScreen,
          PollWorkerScreen,
          ScanDoubleSheetScreen,
          ScanErrorScreen,
          ScannerCoverOpenScreen,
          ScanProcessingScreen,
          ScanSuccessScreen,
          ScanWarningScreen,
          ScanReturnedBallotScreen,
          ScanJamScreen,
          ScanBusyScreen,
          SetupScannerScreen,
          UnconfiguredElectionScreenWrapper,
          UnconfiguredPrecinctScreen,
        ]}
      />
    </ScanAppBase>
  );
}
