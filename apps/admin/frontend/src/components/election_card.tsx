import React from 'react';
import { Link } from 'react-router-dom';
import type { DateWithoutTime } from '@votingworks/basics';
import { Card, H2, Icons, P, Seal } from '@votingworks/ui';
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

const EditLabel = styled.span`
  align-items: center;
  color: ${(p) => p.theme.colors.primary};
  display: flex;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: 0.5rem;
  margin-left: auto;
  opacity: 0;
`;

const CardLink = styled(Link)`
  color: inherit;
  display: block;
  text-decoration: none;

  &:hover ${EditLabel}, &:focus-visible ${EditLabel} {
    opacity: 1;
  }
`;

export function ElectionCardLink({
  to,
  action,
  ...cardProps
}: ElectionCardProps & {
  to: string;
  action: 'edit' | 'view';
}): JSX.Element {
  return (
    <CardLink to={to}>
      <ElectionCard {...cardProps}>
        <EditLabel>
          {action === 'view' ? (
            <React.Fragment>
              <Icons.Eye /> View
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Icons.Edit /> Edit
            </React.Fragment>
          )}
        </EditLabel>
      </ElectionCard>
    </CardLink>
  );
}
