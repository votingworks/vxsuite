import { useEffect, useState } from 'react';
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
  const [lastKeyPress, setLastKeyPress] = useState<{
    key: string;
    pressedAt: Date;
  }>();

  function stopTesting() {
    stopElectricalTestingMutationQuery.mutate();
    setIsTestRunning(false);
  }

  useEffect(() => {
    function handleKeyboardEvent(e: KeyboardEvent) {
      if (isTestRunning) {
        setLastKeyPress({ key: e.key, pressedAt: new Date() });
      }
    }

    document.addEventListener('keydown', handleKeyboardEvent);
    return () => {
      document.removeEventListener('keydown', handleKeyboardEvent);
    };
  }, [isTestRunning]);

  return (
    <Main>
      <ElectricalTestingScreen
        additionalContent={
          <span>
            Last key press:{' '}
            {lastKeyPress
              ? `${lastKeyPress.key} at ${lastKeyPress.pressedAt.toISOString()}`
              : 'N/A'}
          </span>
        }
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
