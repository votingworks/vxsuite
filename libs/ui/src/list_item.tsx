import React from 'react';
import styled from 'styled-components';

export interface ListItemProps {
  children: React.ReactNode;
  className?: string;
}

const Container = styled.li`
  list-style: disc outside;
  margin-left: 0.9rem;
`;

export function ListItem(props: ListItemProps): JSX.Element {
  const { children, className } = props;

  return <Container className={className}>{children}</Container>;
}
