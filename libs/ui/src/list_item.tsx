import React from 'react';
import styled from 'styled-components';
import { Icons } from './icons';

export interface ListItemProps {
  children: React.ReactNode;
  className?: string;
}

const Container = styled.li`
  align-items: start;
  display: flex;
  gap: 0.25rem;
  margin: 0;
  padding-left: 0.5rem;
`;

const IconContainer = styled.span`
  align-items: center;
  display: flex;
  height: ${(p) => p.theme.sizes.lineHeight}em;

  & > * {
    font-size: 0.5em;
  }
`;

export function ListItem(props: ListItemProps): JSX.Element {
  const { children, className } = props;

  return (
    <Container className={className}>
      <IconContainer>
        <Icons.CircleSolid />
      </IconContainer>
      <span>{children}</span>
    </Container>
  );
}
