import type React from 'react';
import type { DateWithoutTime } from '@votingworks/basics';
import { Card, H2, P, Seal } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import styled from 'styled-components';

const Container = styled(Card).attrs({ color: 'neutral' })`
  margin: 1rem 0;

  > div {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
  }
`;

export interface ElectionCardProps {
  seal: string;
  title: string;
  jurisdictionName: string;
  state: string;
  date: DateWithoutTime;
  children?: React.ReactNode;
}

export function ElectionCard({
  seal,
  title,
  jurisdictionName,
  state,
  date,
  children,
}: ElectionCardProps): JSX.Element {
  return (
    <Container>
      <Seal seal={seal} maxWidth="7rem" />
      <div>
        <H2 as="h3">{title}</H2>
        <P>
          {[jurisdictionName, state].filter(Boolean).join(', ')}
          <br />
          {format.localeLongDate(date.toMidnightDatetimeWithSystemTimezone())}
        </P>
      </div>
      {children}
    </Container>
  );
}
