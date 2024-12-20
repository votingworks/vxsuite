import React from 'react';
import styled from 'styled-components';

import { useNow } from './hooks/use_now';

const Container = styled('span')`
  font-weight: 500;
`;

const Number = styled('span')`
  margin-right: 0.0625em;
`;

const Label = styled('span')`
  font-size: 0.75em;
`;

interface TimerProps {
  countDownTo: Date;
}

export function Timer({ countDownTo }: TimerProps): JSX.Element {
  const now = useNow().toJSDate();
  const msRemaining = Math.max(countDownTo.getTime() - now.getTime(), 0);
  const secondsRemaining = Math.round(msRemaining / 1000);

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  return (
    <Container>
      {/* Always display minutes and seconds, only display hours if non-zero */}
      {hours > 0 && (
        <React.Fragment>
          <Number>{hours.toString().padStart(2, '0')}</Number>
          <Label>h</Label>
          <span> </span>
        </React.Fragment>
      )}
      <Number>{minutes.toString().padStart(2, '0')}</Number>
      <Label>m</Label>
      <span> </span>
      <Number>{seconds.toString().padStart(2, '0')}</Number>
      <Label>s</Label>
    </Container>
  );
}
