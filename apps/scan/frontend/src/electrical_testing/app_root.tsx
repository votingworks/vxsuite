import { useInterval } from 'use-interval';
import { useState } from 'react';
import { Main } from '@votingworks/ui';

import { useSound } from '../utils/use_sound';
import {
  getElectricalTestingStatusMessages,
  stopElectricalTestingMutation,
} from './api';

const SOUND_INTERVAL_SECONDS = 5;

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusMessagesQuery =
    getElectricalTestingStatusMessages.useQuery();
  const stopElectricalTestingMutationQuery =
    stopElectricalTestingMutation.useMutation();
  const playSound = useSound('success');
  const [isTestRunning, setIsTestRunning] = useState(true);

  useInterval(playSound, isTestRunning ? SOUND_INTERVAL_SECONDS * 1000 : null);

  function stopTesting() {
    stopElectricalTestingMutationQuery.mutate();
    setIsTestRunning(false);
  }

  return (
    <Main centerChild style={{ height: '100%', padding: '1rem' }}>
      <img src="../../src/electrical_testing/mario.gif" alt="Mario" />
      <br />
      <ul style={{ listStyleType: 'none', margin: 0, padding: 0 }}>
        {(getElectricalTestingStatusMessagesQuery.data ?? []).map(
          ({ component, statusMessage, updatedAt }) => (
            <li key={component}>
              [{updatedAt}] {component}: {statusMessage}
            </li>
          )
        )}
      </ul>
      <button type="button" onClick={stopTesting} disabled={!isTestRunning}>
        {isTestRunning ? 'Stop Testing' : 'Testing Stopped'}
      </button>
    </Main>
  );
}
