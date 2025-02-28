import { useState } from 'react';
import { useInterval } from 'use-interval';
import { ElectricalTestingScreen, Main } from '@votingworks/ui';

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

  const [isTestRunning, setIsTestRunning] = useState(true);
  const playSound = useSound('success');

  function stopTesting() {
    stopElectricalTestingMutationQuery.mutate();
    setIsTestRunning(false);
  }

  useInterval(playSound, isTestRunning ? SOUND_INTERVAL_SECONDS * 1000 : null);

  return (
    <Main>
      <ElectricalTestingScreen
        graphic={<img src="/mario.gif" alt="Mario" />}
        isTestRunning={isTestRunning}
        statusMessages={getElectricalTestingStatusMessagesQuery.data ?? []}
        stopTesting={stopTesting}
      />
    </Main>
  );
}
