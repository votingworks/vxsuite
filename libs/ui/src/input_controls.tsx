/* istanbul ignore file - @preserve */
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { CounterButton } from './counter_button';
import { useKeyPressTracking } from './hooks/use_key_press_tracking';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0.5rem;
`;

function formatTimestamp(timestamp: DateTime): string {
  return timestamp.toFormat('HH:mm:ss');
}
/**
 * A component that displays input controls for hardware testing.
 * Includes a tap counter button and displays the last key press.
 */
export function InputControls(): JSX.Element {
  const lastKeyPress = useKeyPressTracking();

  return (
    <Column>
      <CounterButton />
      Last key press:{' '}
      {lastKeyPress ? (
        <React.Fragment>
          <code>{lastKeyPress.key}</code> at{' '}
          {formatTimestamp(lastKeyPress.pressedAt)}
        </React.Fragment>
      ) : (
        'n/a'
      )}
    </Column>
  );
}
