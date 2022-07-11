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
import { throwIllegalValue } from '@votingworks/utils';
import { Context, Event, machine } from '../plustek_machine';

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
          {voterState === 'needs_review' && (
            <Text>(c)ast ballot | (r)eturn ballot</Text>
          )}
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
    });
    // machineService.onTransition((state) => {
    //   console.log('transition:', state.value);
    // });
  }, []);

  useInput((input) => {
    switch (input) {
      case 'v':
        machineService.send({ type: 'SET_INTERPRETATION_MODE', mode: 'valid' });
        break;
      case 'i':
        machineService.send({
          type: 'SET_INTERPRETATION_MODE',
          mode: 'invalid',
        });
        break;
      case 'a':
        machineService.send({
          type: 'SET_INTERPRETATION_MODE',
          mode: 'adjudicate',
        });
        break;
      case 'c':
        if (state?.matches('needs_review')) {
          machineService.send({ type: 'REVIEW_CAST' });
        }
        break;
      case 'r':
        if (state?.matches('needs_review')) {
          machineService.send({ type: 'REVIEW_RETURN' });
        }
        break;

      case 'q':
        process.exit(0);
        break;

      default:
    }
  });

  return (
    <Box height={30} flexDirection="column">
      <Box justifyContent="space-between">
        <Text color="#6638b6" inverse bold>
          Ballot Quest
        </Text>
        <Text>(q)uit</Text>
        <Text>
          Interpretation mode:{' '}
          <Text bold={state?.context.interpretationMode === 'valid'}>
            (v)alid
          </Text>{' '}
          |{' '}
          <Text bold={state?.context.interpretationMode === 'invalid'}>
            (i)nvalid
          </Text>{' '}
          |{' '}
          <Text bold={state?.context.interpretationMode === 'adjudicate'}>
            (a)djudicate
          </Text>
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
