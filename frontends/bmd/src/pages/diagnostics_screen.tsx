import React from 'react';
import {
  Devices,
  Screen,
  Main,
  MainChild,
  Prose,
  Button,
  Text,
} from '@votingworks/ui';
import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import assert from 'assert';
import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { VersionsData } from '../components/versions_data';
import { MachineConfig } from '../config/types';

interface Props {
  devices: Devices;
  onBackButtonPress: () => void;
  machineConfig: MachineConfig;
  electionDefinition: ElectionDefinition;
  appPrecinct: PrecinctSelection;
}

// interface Diagnostics {
//   cardReader?: {
//     startedAt: DateTime;
//     endedAt: DateTime;
//     errorMessage: string;
//   }

// }

export function DiagnosticsScreen({
  devices,
  onBackButtonPress,
  machineConfig,
  electionDefinition,
  appPrecinct,
}: Props): JSX.Element {
  // const [diagnostics, setDiagnostics] = useState({ });

  function onPressRunCardReaderDiagnostic() {
    // do nothing
  }

  const { computer, cardReader, printer } = devices;

  // Can't get to this screen without having the card reader and printer connected
  assert(cardReader);
  assert(printer);

  return (
    <Screen flexDirection="row-reverse" voterMode={false}>
      <Main padded>
        <MainChild>
          <Prose compact>
            <h1>System Diagnostics</h1>
            <h2>Computer</h2>
            <Text warningIcon={computer.batteryIsLow}>
              Battery:{' '}
              {computer.batteryLevel &&
                `${Math.round(computer.batteryLevel * 100)}%`}
              .{' '}
              {computer.batteryIsCharging
                ? 'Power cord connected.'
                : 'No power cord connected.'}
            </Text>
            <h2>Card Reader</h2>
            <Text voteIcon>Test passed at Weds, Feb 16th, 2022, 10:32 AM</Text>
            <Button
              style={{ marginTop: '0.5em' }}
              onPress={onPressRunCardReaderDiagnostic}
            >
              Test Card Reader
            </Button>
            <h2>Printer</h2>
            {printer.state === null ? (
              <Text warningIcon>Could not get printer status.</Text>
            ) : (
              <React.Fragment>
                <Text>
                  Toner level:{' '}
                  {printer.markerInfos[0]
                    ? `${printer.markerInfos[0].level}%`
                    : 'unknown'}
                </Text>
                {printer.stateReasons[0] &&
                  printer.stateReasons[0] !== 'none' && (
                    <Text warningIcon>
                      Printer status: {printer.stateReasons}
                    </Text>
                  )}
              </React.Fragment>
            )}
            <h2>Accessible Controller</h2>
            {/* <Text warningIcon>Accessible controller is not connected.</Text> */}
            <Text warningIcon>
              Test failed at Weds, Feb 16th, 2022, 10:32 AM
            </Text>
            <Button
              style={{ marginTop: '0.5em' }}
              onPress={onPressRunCardReaderDiagnostic}
            >
              Test Accessible Controller
            </Button>
          </Prose>
        </MainChild>
      </Main>
      <Sidebar
        appName={machineConfig.appMode.productName}
        centerContent
        title="Poll Worker Actions"
        screenReaderInstructions="To navigate through the available actions, use the down arrow."
        footer={
          <React.Fragment>
            <ElectionInfo
              electionDefinition={electionDefinition}
              precinctSelection={appPrecinct}
              horizontal
            />
            <VersionsData
              machineConfig={machineConfig}
              electionHash={electionDefinition.electionHash}
            />
          </React.Fragment>
        }
      >
        <Button onPress={onBackButtonPress}>Back</Button>
      </Sidebar>
    </Screen>
  );
}
