import React from 'react';
import styled from 'styled-components';

export interface ListProps {
  children: React.ReactNode;
  className?: string;
  maxColumns?: number;
}

interface ContainerProps {
  numColumns: number;
}

const Container = styled.ul<ContainerProps>`
  display: grid;
  grid-gap: 0.5rem;
  grid-template-columns: repeat(${(p) => p.numColumns}, 1fr);
  margin: 0;
  padding: 0;

  &:not(:last-child) {
    margin-bottom: 0.35rem;
  }
`;

export function List(props: ListProps): JSX.Element {
  const { children, className, maxColumns = 1 } = props;

  const numItems = React.Children.count(children);
  const numColumns = Math.min(numItems, maxColumns);

  return (
    <Container className={className} numColumns={numColumns}>
      {children}
    </Container>
  );
}
