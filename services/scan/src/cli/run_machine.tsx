/* eslint-disable @typescript-eslint/no-shadow */
import React, { useEffect, useState } from 'react';
import { Box, Newline, render, Text, useInput } from 'ink';
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
import { throwIllegalValue, assert } from '@votingworks/utils';
import {
  Context,
  Event,
  InterpretationResultEvent,
  machine,
} from '../plustek_machine';

// Copy-pasted from return type of machineService.subscribe
type MachineState = State<
  Context,
  Event,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        case state.matches('configuring'):
          return 'connecting';
        case state.matches('connecting'):
          return 'connecting';
        case state.matches('checking_initial_paper_status'):
          return 'connecting';
        case state.matches('error_disconnected'):
          return 'disconnected';
        case state.matches('reconnecting'):
          return 'disconnected';
        case state.matches('no_paper'):
          return 'no_paper';
        case state.matches('ready_to_scan'):
          return 'no_paper';
        case state.matches('scanning'):
          return 'scanning';
        case state.matches('error_scanning'):
          return 'scanning';
        case state.matches('checking_scanning_completed'):
          return 'scanning';
        case state.matches('interpreting'):
          return 'scanning';
        case state.matches('ready_to_accept'):
          return 'scanning';
        case state.matches('accepting'):
          return 'scanning';
        case state.matches('accepted'):
          return 'accepted';
        case state.matches('needs_review'):
          return 'needs_review';
        case state.matches('returning'):
          return 'returned';
        case state.matches('checking_returning_completed'):
          return 'returned';
        case state.matches('returned'):
          return 'returned';
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
        case 'disconnected':
          return 'Scanner disconnected';
        case 'no_paper':
          return 'Insert a ballot';
        case 'scanning':
          return 'Scanning ballot...';
        case 'accepted':
          return 'Ballot counted!';
        case 'needs_review':
          return 'Ballot needs review';
        case 'returned':
          return 'Remove ballot to continue.';
        case 'rejected':
          return 'Ballot could not be counted. Remove ballot to continue.';
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
  const showError =
    voterState &&
    ['rejected', 'jammed', 'both_sides_have_paper', 'error'].includes(
      voterState
    );
  return (
    <Box borderStyle="classic" flexDirection="column">
      <Box paddingLeft={1}>
        <Text>Ballots counted: {state?.context.ballotsCounted}</Text>
      </Box>
      <Box justifyContent="center" paddingY={3}>
        <Box flexDirection="column" alignItems="center">
          <Text bold>{headline}</Text>
          {showError && state?.context.error && (
            <Text dimColor>{state.context.error.toString()}</Text>
          )}
          {voterState === 'needs_review' &&
            (() => {
              assert(state);
              const { interpretation } = state.context;
              assert(interpretation?.type === 'INTERPRETATION_NEEDS_REVIEW');
              return (
                <>
                  <Text>(c)ast ballot | (r)eturn ballot</Text>
                  <Text>{JSON.stringify(interpretation.reasons)}</Text>
                </>
              );
            })()}
        </Box>
      </Box>
    </Box>
  );
}

function MachineTextAdventure() {
  const [state, setState] = useState<MachineState>();
  const [history, setHistory] = useState<MachineState[]>([]);

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
      if (state.matches('ready_to_scan')) {
        machineService.send('SCAN');
      } else if (state.matches('ready_to_accept')) {
        machineService.send('ACCEPT');
      }
    });
  }, []);

  useInput((input) => {
    switch (input) {
      // Interpretation mode
      case 'i':
        machineService.send({
          type: 'SET_INTERPRETATION_MODE',
          mode: 'interpret',
        });
        break;
      case 's':
        machineService.send({
          type: 'SET_INTERPRETATION_MODE',
          mode: 'skip',
        });
        break;

      // Ballot review
      case 'c':
        if (state?.matches('needs_review')) {
          machineService.send('ACCEPT');
        }
        break;
      case 'r':
        if (state?.matches('needs_review')) {
          machineService.send('RETURN');
        }
        break;

      // General commands
      case 'q':
        process.exit(0);
        break;

      default:
    }
  });

  return (
    <Box height={33} flexDirection="column">
      <Box justifyContent="space-between">
        <Text color="#6638b6" inverse bold>
          Ballot Quest
        </Text>
        <Text>(q)uit</Text>
        <Text>
          Run Interpretation:{' '}
          <Text bold={state?.context.interpretationMode === 'interpret'}>
            (i)nterpret
          </Text>{' '}
          |{' '}
          <Text bold={state?.context.interpretationMode === 'skip'}>
            (s)kip
          </Text>{' '}
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
            {Object.entries(state?.context ?? {})
              .filter(([key]) => key !== 'interpretationMode')
              .map(([key, value]) => {
                let valueString;
                if (key === 'client' && value) {
                  valueString = (value as ScannerClient).isConnected()
                    ? 'connected'
                    : 'disconnected';
                } else if (key === 'store' && value) {
                  valueString = 'Store';
                } else if (key === 'interpreter' && value) {
                  valueString = 'SimpleInterpreter';
                } else if (value instanceof Error) {
                  valueString = value.toString();
                } else if (key === 'interpretation' && value) {
                  const interpretation = value as InterpretationResultEvent;
                  if (interpretation.type === 'INTERPRETATION_INVALID') {
                    valueString = `Invalid: ${interpretation.reason}`;
                  } else if (
                    interpretation.type === 'INTERPRETATION_NEEDS_REVIEW'
                  ) {
                    valueString = `Needs review: ${JSON.stringify(
                      interpretation.reasons
                    )}`;
                  } else {
                    valueString = 'Valid';
                  }
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
          <Box flexDirection="column">
            <Box>
              <Box flexBasis="50%">
                <Text dimColor>Event</Text>
              </Box>
              <Box flexBasis="50%">
                <Text dimColor>Next State</Text>
              </Box>
            </Box>
            {history.map((state, i) => (
              <Box key={i}>
                <Box flexBasis="50%">
                  <Text>
                    {state.event.type
                      .replace(/#?plustek./, '')
                      .replace(':invocation[0]', '')}
                  </Text>
                </Box>
                <Box flexBasis="50%">
                  <Text>{stateToString(state)}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

clear();
render(<MachineTextAdventure />);
