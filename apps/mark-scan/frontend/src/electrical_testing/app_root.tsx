import { Main } from '@votingworks/ui';

import { getElectricalTestingStatusMessages } from './api';

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusMessagesQuery =
    getElectricalTestingStatusMessages.useQuery();

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

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio autoPlay loop src="/sounds/alarm.mp3" />
    </Main>
  );
}
