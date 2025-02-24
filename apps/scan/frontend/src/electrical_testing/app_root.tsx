import { useEffect } from 'react';
import { Main } from '@votingworks/ui';

import { useSound } from '../utils/use_sound';
import { getElectricalTestingStatusMessages } from './api';

const SOUND_INTERVAL_SECONDS = 5;

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusMessagesQuery =
    getElectricalTestingStatusMessages.useQuery();
  const playSound = useSound('success');

  useEffect(() => {
    const soundInterval = setInterval(() => {
      playSound();
    }, SOUND_INTERVAL_SECONDS * 1000);
    return () => clearInterval(soundInterval);
  }, [playSound]);

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
    </Main>
  );
}
