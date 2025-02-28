import { useState } from 'react';
import { ElectricalTestingScreen, Main } from '@votingworks/ui';

import {
  getElectricalTestingStatusMessages,
  stopElectricalTestingMutation,
} from './api';

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusMessagesQuery =
    getElectricalTestingStatusMessages.useQuery();
  const stopElectricalTestingMutationQuery =
    stopElectricalTestingMutation.useMutation();

  const [isTestRunning, setIsTestRunning] = useState(true);

  function stopTesting() {
    stopElectricalTestingMutationQuery.mutate();
    setIsTestRunning(false);
  }

  return (
    <Main>
      <ElectricalTestingScreen
        graphic={<img src="/mario.gif" alt="Mario" />}
        isTestRunning={isTestRunning}
        statusMessages={getElectricalTestingStatusMessagesQuery.data ?? []}
        stopTesting={stopTesting}
      />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      {isTestRunning && <audio autoPlay loop src="/sounds/success-5s.mp3" />}
    </Main>
  );
}
