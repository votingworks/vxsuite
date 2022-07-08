/* eslint-disable @typescript-eslint/no-shadow */
import React, { useEffect } from 'react';
import { Box, Newline, render, Text } from 'ink';
import { useInterpret } from '@xstate/react';
import { ScannerClient } from '@votingworks/plustek-sdk';
import clear from 'clear';
import { machine } from './plustek_machine';

function MachineTextAdventure() {
  const [state, setState] = React.useState<any>();
  const [history, setHistory] = React.useState<any[]>([]);

  const machineService = useInterpret(machine);
  useEffect(() => {
    machineService.subscribe((state) => {
      setState(state);
      setHistory((prevHistory) => {
        if (prevHistory[0]?.value !== state.value) {
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
    <Box height={15} flexDirection="column">
      <Box>
        <Text color="#6638b6" inverse bold>
          BallotQuest 3000
        </Text>
      </Box>
      <Box flexDirection="row">
        <Box borderStyle="classic" paddingX={2} flexBasis="50%">
          <Text>
            <Text dimColor>State</Text>
            <Newline />
            <Text bold>{state?.value}</Text>
            <Newline />
            <Newline />
            <Newline />
            <Text dimColor>Context</Text>
            <Newline />
            {Object.entries(state?.context ?? {}).map(([key, value]) => {
              if (key === 'client' && value) {
                // eslint-disable-next-line no-param-reassign
                value = { isConnected: (value as ScannerClient).isConnected() };
              }

              return (
                <Text key={key}>
                  - {key}: {JSON.stringify(value)}
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
                {state.value}
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
