/* eslint-disable @typescript-eslint/no-shadow */
import React, { useEffect } from 'react';
import { Box, Newline, render, Text } from 'ink';
import { useInterpret } from '@xstate/react';
import { ScannerClient } from '@votingworks/plustek-sdk';
import clear from 'clear';
import {
  BaseActionObject,
  ResolveTypegenMeta,
  ServiceMap,
  State,
  TypegenDisabled,
} from 'xstate';
import { throwIllegalValue } from '@votingworks/utils';
import { Context, Event, machine } from './plustek_machine';

// Copy-pasted from return type of machineService.subscribe
type MachineState = State<
  Context,
  Event,
  any,
  {
    value: any;
    context: Context;
  },
  ResolveTypegenMeta<TypegenDisabled, Event, BaseActionObject, ServiceMap>
>;

function stateToString(state?: MachineState) {
  if (!state) return '';
  const strings = state.toStrings();
  return strings[strings.length - 1];
}

function VoterScreen({ state }: { state?: MachineState }) {
  const voterState =
    state &&
    (() => {
      switch (true) {
        case state.matches('connecting'):
          return 'connecting';
        case state.matches('error_disconnected'):
          return 'connecting';
        case state.matches('checking_initial_paper_status'):
          return 'connecting';
        case state.matches('no_paper'):
          return 'no_paper';
        case state.matches('scanning'):
          return 'scanning';
        case state.matches('error_scanning'):
          return 'scanning';
        case state.matches('interpreting'):
          return 'scanning';
        case state.matches('accepting'):
          return 'scanning';
        case state.matches('accepted'):
          return 'accepted';
        case state.matches('needs_review'):
          return 'needs_review';
        case state.matches('rejecting'):
          return 'rejected';
        case state.matches('checking_rejecting_completed'):
          return 'rejected';
        case state.matches('rejected'):
          return 'rejected';
        case state.matches('error_jammed'):
          return 'jammed';
        case state.matches('error_both_sides_have_paper'):
          return 'both_sides_have_paper';
        case state.matches('error_unexpected_event'):
          return 'error';
        default:
          throw new Error(`Unexpected state: ${state.value}`);
      }
    })();

  const headline =
    voterState &&
    (() => {
      switch (voterState) {
        case 'connecting':
          return 'Starting up scanner...';
        case 'no_paper':
          return 'Insert a ballot';
        case 'scanning':
          return 'Scanning ballot...';
        case 'accepted':
          return 'Ballot counted!';
        case 'needs_review':
          return 'Ballot needs review';
        case 'rejected':
          return 'Ballot could not be counted';
        case 'jammed':
          return 'Scanner jammed. Remove ballot from scanner.';
        case 'both_sides_have_paper':
          return 'Scanner jammed. Remove ballot from tray.';
        case 'error':
          return 'Scanner error';
        default:
          throwIllegalValue(voterState);
      }
    })();
  return (
    <Box borderStyle="classic" justifyContent="center" paddingY={3}>
      <Text bold>{headline}</Text>
    </Box>
  );
}

function MachineTextAdventure() {
  const [state, setState] = React.useState<MachineState>();
  const [history, setHistory] = React.useState<MachineState[]>([]);

  const machineService = useInterpret(machine);
  useEffect(() => {
    machineService.subscribe((state) => {
      setState(state);
      setHistory((prevHistory) => {
        if (stateToString(prevHistory[0]) !== stateToString(state)) {
          return [state, ...prevHistory].slice(0, 10);
        }
        return prevHistory;
      });
    });
    // machineService.onTransition((state) => {
    //   console.log('transition:', state.value);
    // });
  }, []);

  return (
    <Box height={25} flexDirection="column">
      <Box>
        <Text color="#6638b6" inverse bold>
          BallotQuest 3000
        </Text>
      </Box>
      <VoterScreen state={state} />
      <Box flexDirection="row">
        <Box borderStyle="classic" paddingX={2} flexBasis="50%">
          <Text>
            <Text dimColor>State</Text>
            <Newline />
            <Text bold>{stateToString(state)}</Text>
            <Newline />
            <Newline />
            <Newline />
            <Text dimColor>Context</Text>
            <Newline />
            {Object.entries(state?.context ?? {}).map(([key, value]) => {
              let valueString;
              if (key === 'client' && value) {
                valueString = (value as ScannerClient).isConnected()
                  ? 'connected'
                  : 'disconnected';
              } else if (value instanceof Error) {
                valueString = value.toString();
              } else {
                valueString = JSON.stringify(value);
              }

              return (
                <Text key={key}>
                  - {key}: {valueString}
                  <Newline />
                </Text>
              );
            })}
          </Text>
        </Box>
        <Box borderStyle="classic" paddingX={2} flexBasis="50%">
          <Text>
            <Text dimColor>Transition History</Text>
            <Newline />
            {history.map((state, i) => (
              <Text key={i}>
                {stateToString(state)}
                <Newline />
              </Text>
            ))}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

clear();
render(<MachineTextAdventure />);
