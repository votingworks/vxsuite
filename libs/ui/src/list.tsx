import { SizeMode } from '@votingworks/types';
import React from 'react';
import styled, { DefaultTheme } from 'styled-components';

export interface ListProps {
  children: React.ReactNode;
  className?: string;
  maxColumns?: number;
}

interface ContainerProps {
  numColumns: number;
}

const CONTENT_SPACING_VALUES_REM: Readonly<Record<SizeMode, number>> = {
  desktop: 0.35,
  print: 0.35,
  touchSmall: 0.35,
  touchMedium: 0.35,
  touchLarge: 0.2,
  touchExtraLarge: 0.15,
};

function getSpacingValueRem(p: { theme: DefaultTheme }) {
  return CONTENT_SPACING_VALUES_REM[p.theme.sizeMode];
}

const Container = styled.ul<ContainerProps>`
  display: grid;
  grid-gap: ${(p) => getSpacingValueRem(p)}rem;
  grid-template-columns: repeat(${(p) => p.numColumns}, 1fr);
  margin: 0;
  padding: 0;

  &:not(:last-child) {
    margin-bottom: ${(p) => getSpacingValueRem(p)}rem;
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
